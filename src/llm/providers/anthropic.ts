import * as vscode from 'vscode'
import Anthropic from '@anthropic-ai/sdk'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_TOKENS = 4096

type ClientFactory = (apiKey: string) => Anthropic
type ApiKeyGetter = (key: string) => Promise<string | undefined>

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic'

  private readonly getApiKey: ApiKeyGetter
  private readonly createClient: ClientFactory

  constructor(
    getApiKey: ApiKeyGetter,
    createClient?: ClientFactory
  ) {
    this.getApiKey = getApiKey
    this.createClient = createClient ?? ((apiKey: string) => new Anthropic({ apiKey }))
  }

  async *sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const apiKey = await this.getApiKey('anthropic-api-key')
    if (!apiKey) {
      throw new LlmAuthError('anthropic', 'Anthropic API key is not configured')
    }

    const client = this.createClient(apiKey)

    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const systemParam = systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n')
      : undefined

    const anthropicMessages = nonSystemMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    try {
      const stream = await client.messages.create({
        model: options.model ?? DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: true,
        messages: anthropicMessages,
        ...(systemParam !== undefined ? { system: systemParam } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.reasoningEffort === 'high' ? { thinking: { type: 'enabled' as const, budget_tokens: 10000 } } : {}),
      })

      for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if ('text' in delta) {
            yield delta.text
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof LlmAuthError || error instanceof LlmRateLimitError) {
        throw error
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new LlmAuthError('anthropic', `Anthropic authentication failed: ${error.message}`)
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new LlmRateLimitError(
          `Anthropic rate limit exceeded: ${error.message}`
        )
      }
      throw error
    }
  }
}
