import * as vscode from 'vscode'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider } from './types'

export class LlmService {
  private readonly providers: Map<string, LlmProvider> = new Map()
  private activeProviderId: string | null = null
  private readonly context: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context
  }

  registerProvider(provider: LlmProvider): void {
    this.providers.set(provider.id, provider)
  }

  setProvider(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider '${id}' is not registered`)
    }
    this.activeProviderId = id
  }

  getProvider(id?: string): LlmProvider {
    if (id !== undefined) {
      const provider = this.providers.get(id)
      if (!provider) {
        throw new Error(`Provider '${id}' is not registered`)
      }
      return provider
    }

    if (this.activeProviderId === null) {
      throw new LlmAuthError('none', 'No LLM provider is configured')
    }

    const provider = this.providers.get(this.activeProviderId)
    if (!provider) {
      throw new LlmAuthError(
        this.activeProviderId,
        `Active provider '${this.activeProviderId}' not found`
      )
    }
    return provider
  }

  async *sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const provider = this.getProvider()
    yield* provider.sendMessage(messages, options, token)
  }

  async getApiKey(key: string): Promise<string | undefined> {
    return this.context.secrets.get(key)
  }

  async setApiKey(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value)
  }
}
