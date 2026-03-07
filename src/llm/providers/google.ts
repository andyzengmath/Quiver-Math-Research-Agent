import * as vscode from 'vscode'
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
} from '@google/generative-ai'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider, LlmRateLimitError } from '../types'
import { LlmService } from '../service'

const DEFAULT_MODEL = 'gemini-3.1-pro'
const SECRET_KEY = 'google'

type GoogleAIFactory = (apiKey: string) => GoogleGenerativeAI

/**
 * Google AI (Gemini) LLM provider implementation.
 * Creates streaming content using the @google/generative-ai SDK.
 */
export class GoogleProvider implements LlmProvider {
  readonly id = 'google'

  private readonly llmService: LlmService
  private readonly createClient: GoogleAIFactory

  constructor(llmService: LlmService, clientFactory?: GoogleAIFactory) {
    this.llmService = llmService
    this.createClient = clientFactory ?? ((apiKey: string) => new GoogleGenerativeAI(apiKey))
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

    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystemMessages = messages.filter((m) => m.role !== 'system')

    const systemInstruction = systemMessages.length > 0
      ? systemMessages.map((m) => m.content).join('\n')
      : undefined

    const generativeModel = client.getGenerativeModel({
      model,
      ...(systemInstruction !== undefined ? { systemInstruction } : {}),
    })

    const contents = nonSystemMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }))

    try {
      const result = await generativeModel.generateContentStream({
        contents,
      })

      for await (const chunk of result.stream) {
        yield chunk.text()
      }
    } catch (error: unknown) {
      if (error instanceof LlmAuthError || error instanceof LlmRateLimitError) {
        throw error
      }
      if (error instanceof GoogleGenerativeAIFetchError) {
        if (error.status === 401 || error.status === 403) {
          throw new LlmAuthError('google', `Google AI authentication failed: ${error.message}`)
        }
        if (error.status === 429) {
          throw new LlmRateLimitError(`Google AI rate limit exceeded: ${error.message}`)
        }
      }
      throw error
    }
  }

  private getModelFromConfig(): string | undefined {
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    return config.get<string>('googleModel')
  }
}
