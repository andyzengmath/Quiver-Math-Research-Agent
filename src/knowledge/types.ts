/**
 * Types for the knowledge cache system.
 * Stores citations fetched from external sources (arXiv, nLab, Wikipedia).
 */

export interface Citation {
  readonly source: 'arxiv' | 'nlab' | 'wikipedia'
  readonly title: string
  readonly url: string
  readonly snippet: string
  readonly bibtex?: string
  readonly fetchedAt: number
}

export interface CacheEntry {
  readonly citations: Citation[]
  readonly storedAt: number
}

export type KnowledgeCacheData = Record<string, CacheEntry>

/**
 * Interface for knowledge source clients.
 * Implemented by ArxivClient, WikipediaClient, and NlabClient.
 */
export interface KnowledgeSourceClient {
  search(query: string, maxResults?: number): Promise<Citation[]>
}

/**
 * Status of a single knowledge source query.
 */
export type SourceStatus = 'success' | 'failed' | 'skipped'

/**
 * Result of RAG enrichment including per-source status.
 */
export interface RagStatus {
  readonly enabled: boolean
  readonly sources: {
    readonly arxiv: SourceStatus
    readonly wikipedia: SourceStatus
    readonly nlab: SourceStatus
  }
  readonly citations: Citation[]
}
