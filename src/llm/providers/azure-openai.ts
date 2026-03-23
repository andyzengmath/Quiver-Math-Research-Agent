import * as vscode from 'vscode'
import { AzureOpenAI } from 'openai'
import type OpenAI from 'openai'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'
import { LlmService } from '../service'

const SECRET_KEY = 'azure-openai-api-key'
const DEFAULT_API_VERSION = '2024-12-01-preview'
const TOKEN_SCOPE = 'https://cognitiveservices.azure.com/.default'

interface AzureOpenAiClientOptions {
  readonly apiKey?: string
  readonly endpoint: string
  readonly deployment: string
  readonly apiVersion: string
  readonly azureADTokenProvider?: () => Promise<string>
}

type AzureOpenAiClientFactory = (opts: AzureOpenAiClientOptions) => AzureOpenAI

export type AzureIdentityModule = {
  readonly DefaultAzureCredential: new () => {
    getToken(scope: string): Promise<{ token: string }>
  }
  readonly InteractiveBrowserCredential: new () => {
    getToken(scope: string): Promise<{ token: string }>
  }
}

export type AzureIdentityImporter = () => Promise<AzureIdentityModule>

/**
 * Azure OpenAI LLM provider implementation.
 * Creates streaming chat completions using the Azure OpenAI SDK.
 * Supports both API key and managed identity authentication.
 */
export class AzureOpenAiProvider implements LlmProvider {
  readonly id = 'azure-openai'

  private readonly llmService: LlmService
  private readonly createClient: AzureOpenAiClientFactory
  private readonly importIdentity: AzureIdentityImporter

  constructor(
    llmService: LlmService,
    clientFactory?: AzureOpenAiClientFactory,
    identityImporter?: AzureIdentityImporter
  ) {
    this.llmService = llmService
    this.createClient = clientFactory ?? ((opts: AzureOpenAiClientOptions) =>
      new AzureOpenAI({
        apiKey: opts.apiKey,
        endpoint: opts.endpoint,
        deployment: opts.deployment,
        apiVersion: opts.apiVersion,
        azureADTokenProvider: opts.azureADTokenProvider,
      })
    )
    this.importIdentity = identityImporter ?? (async () => {
      // Use require() instead of dynamic import() so esbuild can bundle @azure/identity
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@azure/identity')
      return mod as unknown as AzureIdentityModule
    })
  }

  async *sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const config = vscode.workspace.getConfiguration('mathAgent.llm')

    const endpoint = config.get<string>('azureEndpoint') ?? ''
    if (!endpoint) {
      throw new LlmAuthError(
        'azure-openai',
        'Azure OpenAI endpoint not configured. Please set your endpoint in settings.'
      )
    }

    const deployment = config.get<string>('azureDeployment') ?? ''
    if (!deployment) {
      throw new LlmAuthError(
        'azure-openai',
        'Azure OpenAI deployment not configured. Please set your deployment name in settings.'
      )
    }

    const apiVersion = config.get<string>('azureApiVersion') ?? DEFAULT_API_VERSION
    const authMethod = config.get<string>('azureAuthMethod') ?? 'api-key'

    const client = authMethod === 'managed-identity'
      ? await this.createManagedIdentityClient(endpoint, deployment, apiVersion)
      : await this.createApiKeyClient(endpoint, deployment, apiVersion)

    // Try Chat Completions API first, fall back to Responses API if model doesn't support it
    yield* await this.tryStreamWithFallback(client, deployment, messages, options)
  }

  private async *tryStreamWithFallback(
    client: AzureOpenAI,
    deployment: string,
    messages: LlmMessage[],
    options: LlmOptions
  ): AsyncIterable<string> {
    // First attempt: Chat Completions API
    try {
      yield* this.streamChatCompletions(client, deployment, messages, options)
      return
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes('does not work with the specified model')) {
        // Model requires Responses API (e.g., GPT-5.4 Pro)
        yield* this.streamResponses(client, deployment, messages, options)
        return
      }
      // Map SDK errors to typed errors before rethrowing
      throw this.mapError(err)
    }
  }

  private async *streamChatCompletions(
    client: AzureOpenAI,
    deployment: string,
    messages: LlmMessage[],
    options: LlmOptions
  ): AsyncIterable<string> {
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: deployment,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
    }

    if (options.maxTokens !== undefined) {
      requestParams.max_tokens = options.maxTokens
    }

    if (options.temperature !== undefined) {
      requestParams.temperature = options.temperature
    }

    if (options.reasoningEffort) {
      (requestParams as unknown as Record<string, unknown>).reasoning_effort = options.reasoningEffort
    }

    const stream = await client.chat.completions.create(requestParams)

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content != null) {
        yield content
      }
    }
  }

  private async *streamResponses(
    _client: AzureOpenAI,
    deployment: string,
    messages: LlmMessage[],
    options: LlmOptions
  ): AsyncIterable<string> {
    // Responses API requires api-version 2025-04-01-preview or newer.
    // The Chat Completions client was created with an older api-version,
    // so we must create a fresh client with the correct version.
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const endpoint = config.get<string>('azureEndpoint') ?? ''
    const authMethod = config.get<string>('azureAuthMethod') ?? 'api-key'

    const RESPONSES_API_VERSION = '2025-04-01-preview'

    let responsesClient: AzureOpenAI
    if (authMethod === 'managed-identity') {
      const tokenProvider = await this.buildTokenProvider()
      responsesClient = new AzureOpenAI({
        endpoint,
        deployment,
        apiVersion: RESPONSES_API_VERSION,
        azureADTokenProvider: tokenProvider,
      })
    } else {
      const apiKey = await this.llmService.getApiKey(SECRET_KEY)
      responsesClient = new AzureOpenAI({
        apiKey: apiKey ?? '',
        endpoint,
        deployment,
        apiVersion: RESPONSES_API_VERSION,
      })
    }

    const input = messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }))

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream = await (responsesClient as any).responses.create({
        model: deployment,
        input,
        stream: true,
        ...(options.reasoningEffort ? { reasoning: { effort: options.reasoningEffort as 'low' | 'medium' | 'high' } } : {}),
        ...(options.maxTokens !== undefined ? { max_output_tokens: options.maxTokens } : {}),
      })

      for await (const event of stream) {
        if (event.type === 'response.output_text.delta') {
          const delta = (event as unknown as { delta: string }).delta
          if (delta) {
            yield delta
          }
        }
      }
    } catch (err: unknown) {
      throw this.mapError(err)
    }
  }

  private async createApiKeyClient(endpoint: string, deployment: string, apiVersion: string): Promise<AzureOpenAI> {
    const apiKey = await this.llmService.getApiKey(SECRET_KEY)
    if (!apiKey) {
      throw new LlmAuthError(
        'azure-openai',
        'Azure OpenAI API key not configured. Please set your API key.'
      )
    }
    return this.createClient({ apiKey, endpoint, deployment, apiVersion })
  }

  private async createManagedIdentityClient(endpoint: string, deployment: string, apiVersion: string): Promise<AzureOpenAI> {
    const tokenProvider = await this.buildTokenProvider()
    return this.createClient({ endpoint, deployment, apiVersion, azureADTokenProvider: tokenProvider })
  }

  private lastAuthSource: string = ''

  public getLastAuthSource(): string {
    return this.lastAuthSource
  }

  private async buildTokenProvider(): Promise<() => Promise<string>> {
    const identityModule = await this.importIdentity()
    const defaultCredential = new identityModule.DefaultAzureCredential()

    // Discover which credential works and cache the first token
    try {
      const initial = await defaultCredential.getToken(TOKEN_SCOPE)
      this.lastAuthSource = 'DefaultAzureCredential (Managed Identity / Azure CLI / Environment)'
      let cachedToken = initial.token
      let used = false
      return async () => {
        if (!used) {
          used = true
          return cachedToken
        }
        const result = await defaultCredential.getToken(TOKEN_SCOPE)
        cachedToken = result.token
        return cachedToken
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CredentialUnavailableError') {
        const browserCredential = new identityModule.InteractiveBrowserCredential()
        try {
          const initial = await browserCredential.getToken(TOKEN_SCOPE)
          this.lastAuthSource = 'InteractiveBrowserCredential (Browser login)'
          let cachedToken = initial.token
          let used = false
          return async () => {
            if (!used) {
              used = true
              return cachedToken
            }
            const result = await browserCredential.getToken(TOKEN_SCOPE)
            cachedToken = result.token
            return cachedToken
          }
        } catch {
          throw new LlmAuthError(
            'azure-openai',
            "Azure authentication failed. Please run 'az login' or sign in via the browser prompt."
          )
        }
      }
      throw new LlmAuthError(
        'azure-openai',
        "Azure authentication failed. Please run 'az login' or sign in via the browser prompt."
      )
    }
  }

  private mapError(err: unknown): Error {
    const status = (err as { status?: number }).status
    if (status === 401) {
      return new LlmAuthError('azure-openai', (err as Error).message)
    }
    if (status === 429) {
      const headers = (err as { headers?: Record<string, string> }).headers
      const retryAfterSec = headers?.['retry-after']
      const retryAfterMs = retryAfterSec ? parseInt(retryAfterSec, 10) * 1000 : undefined
      return new LlmRateLimitError((err as Error).message, retryAfterMs)
    }
    return err as Error
  }
}
