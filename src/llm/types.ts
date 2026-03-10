import * as vscode from 'vscode'

export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant'
  readonly content: string
}

export interface LlmOptions {
  readonly model?: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly reasoningEffort?: 'low' | 'medium' | 'high'
}

export interface LlmProvider {
  readonly id: string
  sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    token: vscode.CancellationToken
  ): AsyncIterable<string>
}

export class LlmAuthError extends Error {
  readonly provider: string

  constructor(provider: string, message?: string) {
    super(message ?? `Authentication failed for provider: ${provider}`)
    this.name = 'LlmAuthError'
    this.provider = provider
  }
}

export class LlmRateLimitError extends Error {
  readonly retryAfterMs?: number

  constructor(message?: string, retryAfterMs?: number) {
    super(message ?? 'Rate limit exceeded')
    this.name = 'LlmRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}
