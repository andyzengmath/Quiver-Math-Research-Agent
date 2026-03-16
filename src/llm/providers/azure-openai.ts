import * as vscode from 'vscode'
import { AzureOpenAI } from 'openai'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'
import { LlmService } from '../service'

const DEFAULT_MODEL = 'gpt-4o'
const SECRET_KEY = 'azure-openai'
const TOKEN_SCOPE = 'https://cognitiveservices.azure.com/.default'

export type AzureOpenAiClientFactory = (opts: {
  readonly endpoint: string
  readonly apiKey?: string
  readonly apiVersion: string
  readonly azureADTokenProvider?: () => Promise<string>
}) => AzureOpenAI

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
    this.createClient = clientFactory ?? ((opts) => new AzureOpenAI(opts))
    // Dynamic import of @azure/identity -- not a static dependency.
    // Uses a variable to prevent TypeScript from resolving the module at compile time.
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
    const endpoint = config.get<string>('azureEndpoint')
    const apiVersion = config.get<string>('azureApiVersion') ?? '2024-10-21'
    const authMethod = config.get<string>('azureAuthMethod') ?? 'api-key'

    if (!endpoint) {
      throw new LlmAuthError('azure-openai', 'Azure OpenAI endpoint not configured. Set mathAgent.llm.azureEndpoint.')
    }

    const model = options.model ?? config.get<string>('azureModel') ?? DEFAULT_MODEL

    const client = authMethod === 'managed-identity'
      ? await this.createManagedIdentityClient(endpoint, apiVersion)
      : await this.createApiKeyClient(endpoint, apiVersion)

    const requestParams = {
      model,
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      stream: true as const,
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    }

    let stream: AsyncIterable<{ choices: Array<{ delta: { content?: string | null } }> }>
    try {
      stream = await client.chat.completions.create(requestParams) as unknown as AsyncIterable<{ choices: Array<{ delta: { content?: string | null } }> }>
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

  private async createApiKeyClient(endpoint: string, apiVersion: string): Promise<AzureOpenAI> {
    const apiKey = await this.llmService.getApiKey(SECRET_KEY)
    if (!apiKey) {
      throw new LlmAuthError('azure-openai', 'Azure OpenAI API key not configured. Please set your API key.')
    }
    return this.createClient({ endpoint, apiKey, apiVersion })
  }

  private async createManagedIdentityClient(endpoint: string, apiVersion: string): Promise<AzureOpenAI> {
    const tokenProvider = await this.buildTokenProvider()
    return this.createClient({ endpoint, apiVersion, azureADTokenProvider: tokenProvider })
  }

  private async buildTokenProvider(): Promise<() => Promise<string>> {
    const identityModule = await this.importIdentity()

    const defaultCredential = new identityModule.DefaultAzureCredential()

    try {
      // Validate that DefaultAzureCredential can obtain a token
      await defaultCredential.getToken(TOKEN_SCOPE)
      return async () => {
        const result = await defaultCredential.getToken(TOKEN_SCOPE)
        return result.token
      }
    } catch (err: unknown) {
      // Fall back to InteractiveBrowserCredential only on CredentialUnavailableError
      if (this.isCredentialUnavailableError(err)) {
        const browserCredential = new identityModule.InteractiveBrowserCredential()
        try {
          await browserCredential.getToken(TOKEN_SCOPE)
          return async () => {
            const result = await browserCredential.getToken(TOKEN_SCOPE)
            return result.token
          }
        } catch {
          throw new LlmAuthError(
            'azure-openai',
            'Azure managed identity authentication failed. Neither DefaultAzureCredential nor InteractiveBrowserCredential could obtain a token.'
          )
        }
      }
      throw new LlmAuthError(
        'azure-openai',
        'Azure managed identity authentication failed. Neither DefaultAzureCredential nor InteractiveBrowserCredential could obtain a token.'
      )
    }
  }

  private isCredentialUnavailableError(err: unknown): boolean {
    return err instanceof Error && err.name === 'CredentialUnavailableError'
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
