import * as vscode from 'vscode'
import { KnowledgeCache } from './cache'
import { Citation } from './types'

/**
 * Wikipedia API search result item shape.
 */
interface WikiSearchItem {
  readonly title: string
  readonly pageid: number
  readonly snippet: string
}

/**
 * Wikipedia API search response shape.
 */
interface WikiSearchResponse {
  readonly query?: {
    readonly search?: readonly WikiSearchItem[]
  }
}

/**
 * Wikipedia API page extract response shape.
 */
interface WikiPageResponse {
  readonly query?: {
    readonly pages?: Record<string, {
      readonly pageid?: number
      readonly title: string
      readonly extract?: string
      readonly missing?: string
    }>
  }
}

/**
 * Strips HTML tags from a string.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

/**
 * Truncates a string to a maximum length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength)
}

/**
 * Builds a Wikipedia page URL from a title.
 * Replaces spaces with underscores per Wikipedia URL convention.
 */
function buildWikiUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`
}

/**
 * Client for fetching mathematical content from Wikipedia.
 * Uses the MediaWiki API to search and retrieve page extracts.
 * Results are cached via KnowledgeCache with 24-hour TTL.
 */
export class WikipediaClient {
  private static readonly API_BASE = 'https://en.wikipedia.org/w/api.php'
  private static readonly MAX_SNIPPET_LENGTH = 500
  private static readonly CACHE_SOURCE = 'wikipedia'

  private readonly cache: KnowledgeCache

  constructor(cache: KnowledgeCache) {
    this.cache = cache
  }

  /**
   * Searches Wikipedia for articles matching the query.
   * Returns cached results if available. Otherwise fetches from the API,
   * caches the results, and returns them.
   *
   * @param query - Search term
   * @param maxResults - Maximum number of results (default 5)
   * @returns Array of Citation objects, or empty array on error
   */
  async search(query: string, maxResults = 5): Promise<Citation[]> {
    const cached = this.cache.get(WikipediaClient.CACHE_SOURCE, query)
    if (cached !== undefined) {
      return cached
    }

    try {
      const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: String(maxResults),
        format: 'json',
        origin: '*',
      })

      const url = `${WikipediaClient.API_BASE}?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        vscode.window.showWarningMessage(
          `Wikipedia search failed with status ${response.status}`
        )
        return []
      }

      const data = (await response.json()) as WikiSearchResponse
      const searchResults = data.query?.search ?? []
      const now = Date.now()

      const citations: Citation[] = searchResults.map((item) => ({
        source: 'wikipedia' as const,
        title: item.title,
        url: buildWikiUrl(item.title),
        snippet: truncate(stripHtml(item.snippet), WikipediaClient.MAX_SNIPPET_LENGTH),
        fetchedAt: now,
      }))

      await this.cache.set(WikipediaClient.CACHE_SOURCE, query, citations)
      return citations
    } catch (error) {
      vscode.window.showWarningMessage(
        `Wikipedia search error: ${error instanceof Error ? error.message : String(error)}`
      )
      return []
    }
  }

  /**
   * Fetches the introductory extract of a specific Wikipedia page.
   *
   * @param title - Exact Wikipedia page title
   * @returns A single Citation, or null if the page is missing or on error
   */
  async getPageContent(title: string): Promise<Citation | null> {
    try {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        exintro: 'true',
        explaintext: 'true',
        titles: title,
        format: 'json',
        origin: '*',
      })

      const url = `${WikipediaClient.API_BASE}?${params.toString()}`
      const response = await fetch(url)

      if (!response.ok) {
        vscode.window.showWarningMessage(
          `Wikipedia page fetch failed with status ${response.status}`
        )
        return null
      }

      const data = (await response.json()) as WikiPageResponse
      const pages = data.query?.pages
      if (!pages) {
        return null
      }

      // The API returns pages keyed by page ID; get the first (only) one
      const pageKeys = Object.keys(pages)
      if (pageKeys.length === 0) {
        return null
      }

      const page = pages[pageKeys[0]]

      // Pages with a "missing" property or negative ID don't exist
      if (page.missing !== undefined || !page.extract) {
        return null
      }

      const citation: Citation = {
        source: 'wikipedia',
        title: page.title,
        url: buildWikiUrl(page.title),
        snippet: truncate(page.extract, WikipediaClient.MAX_SNIPPET_LENGTH),
        fetchedAt: Date.now(),
      }

      return citation
    } catch (error) {
      vscode.window.showWarningMessage(
        `Wikipedia page error: ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }
}
