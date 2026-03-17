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
    const azureIdentityModule = '@azure/identity'
    this.importIdentity = identityImporter ?? (async () => {
      const mod = await import(/* webpackIgnore: true */ azureIdentityModule)
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

    let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>
    try {
      stream = await client.chat.completions.create(requestParams)
    } catch (err: unknown) {
      throw this.mapError(err)
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content != null) {
        yield content
      }
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

  private async buildTokenProvider(): Promise<() => Promise<string>> {
    const identityModule = await this.importIdentity()
    const defaultCredential = new identityModule.DefaultAzureCredential()

    // Discover which credential works and cache the first token
    try {
      const initial = await defaultCredential.getToken(TOKEN_SCOPE)
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
