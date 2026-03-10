import * as vscode from 'vscode'
import OpenAI from 'openai'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'
import { LlmService } from '../service'

const DEFAULT_MODEL = 'gpt-4o'
const SECRET_KEY = 'openai'

type OpenAiClientFactory = (apiKey: string) => OpenAI

/**
 * OpenAI LLM provider implementation.
 * Creates streaming chat completions using the OpenAI SDK.
 */
export class OpenAiProvider implements LlmProvider {
  readonly id = 'openai'

  private readonly llmService: LlmService
  private readonly createClient: OpenAiClientFactory

  constructor(llmService: LlmService, clientFactory?: OpenAiClientFactory) {
    this.llmService = llmService
    this.createClient = clientFactory ?? ((apiKey: string) => new OpenAI({ apiKey }))
  }

  async *sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const apiKey = await this.llmService.getApiKey(SECRET_KEY)
    if (!apiKey) {
      throw new LlmAuthError('openai', 'OpenAI API key not configured. Please set your API key.')
    }

    const model = options.model ?? this.getModelFromConfig() ?? DEFAULT_MODEL
    const client = this.createClient(apiKey)

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model,
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

  private getModelFromConfig(): string | undefined {
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    return config.get<string>('openaiModel')
  }

  private mapError(err: unknown): Error {
    const status = (err as { status?: number }).status
    if (status === 401) {
      return new LlmAuthError('openai', (err as Error).message)
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
