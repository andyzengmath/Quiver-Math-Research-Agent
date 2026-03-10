import { XMLParser } from 'fast-xml-parser'
import { KnowledgeCache } from './cache'
import { Citation } from './types'

/**
 * Represents a parsed arXiv Atom feed entry.
 */
interface ArxivEntry {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly published: string
  readonly author: { name: string } | Array<{ name: string }>
}

/**
 * Represents the parsed arXiv Atom feed structure.
 */
interface ArxivFeed {
  readonly feed: {
    readonly entry?: ArxivEntry | ArxivEntry[]
  }
}

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query'
const RATE_LIMIT_MS = 3000
const SNIPPET_MAX_LENGTH = 500

/**
 * Client for searching arXiv papers via the arXiv API.
 * Parses Atom XML responses into Citation objects.
 * Respects rate limiting (1 request per 3 seconds).
 * Caches results using KnowledgeCache.
 */
export class ArxivClient {
  private readonly cache: KnowledgeCache
  private readonly parser: XMLParser
  private lastRequestTime = 0

  constructor(cache: KnowledgeCache) {
    this.cache = cache
    this.parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
    })
  }

  /**
   * Searches arXiv for papers matching the query.
   * Returns cached results if available.
   * Respects rate limiting (max 1 request per 3 seconds).
   * Returns empty array on error (does not throw).
   */
  async search(query: string, maxResults = 10): Promise<Citation[]> {
    const cached = this.cache.get('arxiv', query)
    if (cached !== undefined) {
      return cached
    }

    await this.enforceRateLimit()

    try {
      const url = this.buildUrl(query, maxResults)
      const response = await fetch(url)

      if (!response.ok) {
        console.warn(
          `arXiv API returned status ${response.status} for query "${query}"`
        )
        return []
      }

      const xml = await response.text()
      const citations = this.parseResponse(xml)

      await this.cache.set('arxiv', query, citations)

      return citations
    } catch (error) {
      console.warn(`arXiv API error for query "${query}":`, error)
      return []
    }
  }

  /**
   * Enforces a minimum delay of 3 seconds between requests.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < RATE_LIMIT_MS && this.lastRequestTime > 0) {
      const delay = RATE_LIMIT_MS - elapsed
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
    this.lastRequestTime = Date.now()
  }

  /**
   * Builds the arXiv API query URL.
   */
  private buildUrl(query: string, maxResults: number): string {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      max_results: String(maxResults),
    })
    return `${ARXIV_API_BASE}?${params.toString()}`
  }

  /**
   * Parses arXiv Atom XML response into Citation objects.
   */
  private parseResponse(xml: string): Citation[] {
    const parsed: ArxivFeed = this.parser.parse(xml)
    const feed = parsed.feed

    if (!feed || !feed.entry) {
      return []
    }

    const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry]

    return entries.map((entry) => this.entryToCitation(entry))
  }

  /**
   * Converts a single arXiv entry to a Citation object.
   */
  private entryToCitation(entry: ArxivEntry): Citation {
    const title = String(entry.title).trim()
    const url = String(entry.id).trim()
    const summary = String(entry.summary).trim()
    const snippet =
      summary.length > SNIPPET_MAX_LENGTH
        ? summary.substring(0, SNIPPET_MAX_LENGTH)
        : summary
    const bibtex = this.generateBibtex(entry)

    return {
      source: 'arxiv',
      title,
      url,
      snippet,
      bibtex,
      fetchedAt: Date.now(),
    }
  }

  /**
   * Generates a BibTeX entry from an arXiv entry.
   * Extracts the arXiv ID from the entry URL.
   */
  private generateBibtex(entry: ArxivEntry): string {
    const arxivId = this.extractArxivId(String(entry.id))
    const title = String(entry.title).trim()
    const authors = this.extractAuthors(entry.author)
    const year = this.extractYear(String(entry.published))

    return [
      `@article{${arxivId},`,
      `  title={${title}},`,
      `  author={${authors}},`,
      `  year={${year}},`,
      `  journal={arXiv preprint},`,
      `  eprint={${arxivId}}`,
      `}`,
    ].join('\n')
  }

  /**
   * Extracts the arXiv ID from a URL like http://arxiv.org/abs/2301.12345v1.
   * Returns the ID without the version suffix.
   */
  private extractArxivId(url: string): string {
    const match = url.match(/abs\/(.+?)(?:v\d+)?$/)
    return match ? match[1] : url
  }

  /**
   * Extracts author names from the entry author field.
   * Handles both single author and multiple authors.
   */
  private extractAuthors(
    author: { name: string } | Array<{ name: string }>
  ): string {
    if (Array.isArray(author)) {
      return author.map((a) => String(a.name)).join(' and ')
    }
    return String(author.name)
  }

  /**
   * Extracts the year from an ISO date string.
   */
  private extractYear(dateStr: string): string {
    const match = dateStr.match(/^(\d{4})/)
    return match ? match[1] : 'unknown'
  }
}
