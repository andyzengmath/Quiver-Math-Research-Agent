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
