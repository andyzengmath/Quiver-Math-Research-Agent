import * as vscode from 'vscode'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'

/**
 * Maps LlmMessage role to a vscode.LanguageModelChatMessage.
 * VS Code LM API only supports User and Assistant roles.
 * System messages are mapped to User role as a workaround.
 */
function toVscodeChatMessage(msg: LlmMessage): vscode.LanguageModelChatMessage {
  switch (msg.role) {
    case 'assistant':
      return vscode.LanguageModelChatMessage.Assistant(msg.content)
    case 'user':
    case 'system':
    default:
      return vscode.LanguageModelChatMessage.User(msg.content)
  }
}

/**
 * Determines whether an error is related to rate limiting.
 */
function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    const code = (err as unknown as Record<string, unknown>).code
    if (typeof code === 'string' && code.toLowerCase().includes('ratelimit')) {
      return true
    }
    if (err.message.toLowerCase().includes('rate limit')) {
      return true
    }
  }
  return false
}

/**
 * VS Code Language Model API provider.
 * Uses vscode.lm.selectChatModels to access Copilot models.
 */
export class VscodeLmProvider implements LlmProvider {
  readonly id = 'vscode-lm'

  async *sendMessage(
    messages: LlmMessage[],
    _options: LlmOptions,
    token: vscode.CancellationToken
  ): AsyncIterable<string> {
    let models: vscode.LanguageModelChat[]
    try {
      models = await vscode.lm.selectChatModels({ vendor: 'copilot' } as vscode.LanguageModelChatSelector)
    } catch (err) {
      throw new LlmAuthError(
        'vscode-lm',
        `Failed to select Copilot models: ${err instanceof Error ? err.message : String(err)}`
      )
    }

    if (models.length === 0) {
      throw new LlmAuthError('vscode-lm', 'No Copilot models available')
    }

    const model = models[0]
    const chatMessages = messages.map(toVscodeChatMessage)

    let response: vscode.LanguageModelChatResponse
    try {
      response = await model.sendRequest(chatMessages, {}, token)
    } catch (err) {
      if (isRateLimitError(err)) {
        throw new LlmRateLimitError(
          err instanceof Error ? err.message : 'Rate limit exceeded'
        )
      }
      throw new LlmAuthError(
        'vscode-lm',
        err instanceof Error ? err.message : 'Authentication failed'
      )
    }

    for await (const fragment of response.text) {
      yield fragment
    }
  }
}
