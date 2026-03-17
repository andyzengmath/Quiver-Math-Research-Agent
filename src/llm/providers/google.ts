import * as vscode from 'vscode'
import { GoogleGenAI } from '@google/genai'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'
import { LlmService } from '../service'

const DEFAULT_MODEL = 'gemini-3.1-pro-preview'
const SECRET_KEY = 'google-api-key'

type GoogleAIFactory = (apiKey: string) => GoogleGenAI

/**
 * Google AI (Gemini) LLM provider implementation.
 * Uses the @google/genai SDK (GA as of 2025).
 */
export class GoogleProvider implements LlmProvider {
  readonly id = 'google'

  private readonly llmService: LlmService
  private readonly createClient: GoogleAIFactory

  constructor(llmService: LlmService, clientFactory?: GoogleAIFactory) {
    this.llmService = llmService
    this.createClient = clientFactory ?? ((apiKey: string) => new GoogleGenAI({ apiKey }))
  }

  async *sendMessage(
    messages: LlmMessage[],
    options: LlmOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): AsyncIterable<string> {
    const apiKey = await this.llmService.getApiKey(SECRET_KEY)
    if (!apiKey) {
      throw new LlmAuthError('google', 'Google AI API key not configured. Please set your API key.')
    }

    const model = options.model ?? this.getModelFromConfig() ?? DEFAULT_MODEL
    const client = this.createClient(apiKey)

    // Separate system messages from conversation
    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n')
      : undefined

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }))

    try {
      const response = await client.models.generateContentStream({
        model,
        contents,
        config: {
          ...(systemInstruction !== undefined ? { systemInstruction } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.maxTokens !== undefined ? { maxOutputTokens: options.maxTokens } : {}),
        },
      })

      for await (const chunk of response) {
        const text = chunk.text
        if (text) {
          yield text
        }
      }
    } catch (error: unknown) {
      if (error instanceof LlmAuthError || error instanceof LlmRateLimitError) {
        throw error
      }
      const errMsg = error instanceof Error ? error.message : String(error)
      const status = (error as { status?: number }).status
      if (status === 401 || status === 403) {
        throw new LlmAuthError('google', `Google AI authentication failed: ${errMsg}`)
      }
      if (status === 429) {
        throw new LlmRateLimitError(`Google AI rate limit exceeded: ${errMsg}`)
      }
      throw error
    }
  }

  private getModelFromConfig(): string | undefined {
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    return config.get<string>('googleModel')
  }
}
