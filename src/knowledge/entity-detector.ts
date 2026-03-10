import * as vscode from 'vscode'
import { LlmService } from '../llm/service'
import { LlmMessage } from '../llm/types'
import mathTerms from './math-terms.json'

/**
 * Detects mathematical entities in text using a two-pass approach:
 *   Pass 1 - keyword matching against a bundled dictionary of math terms
 *   Pass 2 - if no keyword matches and LLM is available, ask the LLM
 */
export class EntityDetector {
  private readonly llmService: LlmService | undefined
  private readonly terms: readonly string[]

  constructor(llmService?: LlmService) {
    this.llmService = llmService
    this.terms = mathTerms
  }

  /**
   * Detects math entities in the given text.
   * Returns an array of matched term strings (deduplicated, lowercase).
   */
  async detect(text: string): Promise<string[]> {
    if (!text || typeof text !== 'string') {
      return []
    }

    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return []
    }

    // Pass 1: keyword matching (case-insensitive, word-boundary)
    const keywordMatches = this.keywordMatch(trimmed)
    if (keywordMatches.length > 0) {
      return keywordMatches
    }

    // Pass 2: LLM fallback
    if (this.llmService) {
      return this.llmFallback(trimmed)
    }

    return []
  }

  /**
   * Scans text for matches against the math terms dictionary.
   * Uses case-insensitive word-boundary matching.
   */
  private keywordMatch(text: string): string[] {
    const lowerText = text.toLowerCase()
    const matches: string[] = []

    for (const term of this.terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i')
      if (pattern.test(lowerText)) {
        matches.push(term)
      }
    }

    return [...new Set(matches)]
  }

  /**
   * Falls back to asking the LLM to identify math entities.
   * Returns an empty array if the LLM is unavailable or fails.
   */
  private async llmFallback(text: string): Promise<string[]> {
    try {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: `List mathematical entities/concepts mentioned in this text as a JSON array of strings. Return only the array.\n\n${text}`,
        },
      ]

      const tokenSource = new vscode.CancellationTokenSource()
      let response = ''

      try {
        for await (const chunk of this.llmService!.sendMessage(
          messages,
          { maxTokens: 256, temperature: 0 },
          tokenSource.token
        )) {
          response += chunk
        }
      } finally {
        tokenSource.dispose()
      }

      return this.parseLlmResponse(response)
    } catch {
      return []
    }
  }

  /**
   * Parses an LLM response expected to be a JSON array of strings.
   */
  private parseLlmResponse(response: string): string[] {
    try {
      // Extract JSON array from the response (handle markdown code blocks)
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        return []
      }

      const parsed: unknown = JSON.parse(jsonMatch[0])

      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((s) => s.toLowerCase().trim())
        .filter((s) => s.length > 0)
    } catch {
      return []
    }
  }
}
