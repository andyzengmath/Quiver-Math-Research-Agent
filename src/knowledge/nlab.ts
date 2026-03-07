import * as cheerio from 'cheerio'
import { KnowledgeCache } from './cache'
import { Citation } from './types'

/**
 * Client for fetching mathematical content from nLab (ncatlab.org).
 * Supports page lookup and search with caching and rate limiting.
 */
export class NlabClient {
  private static readonly BASE_URL = 'https://ncatlab.org/nlab/show/'
  private static readonly RATE_LIMIT_MS = 5000
  private static readonly SNIPPET_MAX_LENGTH = 500

  private readonly cache: KnowledgeCache
  private lastRequestTime = 0

  constructor(cache: KnowledgeCache) {
    this.cache = cache
  }

  /**
   * Fetches a page from nLab by page name.
   * Returns an array with a single Citation on success, or empty array on failure.
   *
   * @param pageName - The nLab page name (e.g., 'derived+category')
   */
  async getPage(pageName: string): Promise<Citation[]> {
    const cached = this.cache.get('nlab', pageName)
    if (cached !== undefined) {
      return cached
    }

    await this.enforceRateLimit()

    const url = `${NlabClient.BASE_URL}${pageName}`

    let response: Response
    try {
      response = await fetch(url)
    } catch {
      return []
    }

    if (!response.ok) {
      return []
    }

    const html = await response.text()
    const text = this.extractContent(html)

    if (text.length === 0) {
      return []
    }

    const snippet = text.length > NlabClient.SNIPPET_MAX_LENGTH
      ? text.slice(0, NlabClient.SNIPPET_MAX_LENGTH)
      : text

    const citation: Citation = {
      source: 'nlab',
      title: pageName.replace(/\+/g, ' '),
      url,
      snippet,
      fetchedAt: Date.now(),
    }

    const results = [citation]
    await this.cache.set('nlab', pageName, results)
    return results
  }

  /**
   * Searches nLab by converting the query to a page name and fetching it.
   * Spaces are converted to '+' for the URL.
   *
   * @param query - The search query (e.g., 'derived category')
   */
  async search(query: string): Promise<Citation[]> {
    const pageName = query.replace(/\s+/g, '+')
    return this.getPage(pageName)
  }

  /**
   * Extracts text content from the #Content div of an nLab HTML page.
   * Strips nav, script, style, and sidebar elements.
   */
  private extractContent(html: string): string {
    const $ = cheerio.load(html)
    const contentDiv = $('#Content')

    if (contentDiv.length === 0) {
      return ''
    }

    // Remove unwanted elements within #Content
    contentDiv.find('nav, script, style').remove()

    const text = contentDiv.text().trim()
    // Normalize whitespace (collapse multiple spaces/newlines into single space)
    return text.replace(/\s+/g, ' ').trim()
  }

  /**
   * Enforces rate limiting by waiting until at least RATE_LIMIT_MS
   * has passed since the last request.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    const waitTime = NlabClient.RATE_LIMIT_MS - elapsed

    if (waitTime > 0) {
      await this.delay(waitTime)
    }

    this.lastRequestTime = Date.now()
  }

  /**
   * Returns a promise that resolves after the specified milliseconds.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
