import * as vscode from 'vscode'
import { CacheEntry, Citation, KnowledgeCacheData } from './types'

/**
 * Caches citation data in VS Code global state (Memento).
 * Entries expire based on a configurable TTL (default 24 hours).
 */
export class KnowledgeCache {
  private static readonly CACHE_KEY = 'mathAgent.knowledgeCache'
  private readonly globalState: vscode.Memento

  constructor(globalState: vscode.Memento) {
    this.globalState = globalState
  }

  /**
   * Retrieves cached citations for a given source and query.
   * Returns undefined if no entry exists or the entry has expired.
   */
  get(source: string, query: string): Citation[] | undefined {
    const data = this.getData()
    const key = this.buildKey(source, query)
    const entry = data[key]

    if (!entry) {
      return undefined
    }

    if (this.isExpired(entry)) {
      return undefined
    }

    return entry.citations
  }

  /**
   * Stores citations for a given source and query with a timestamp.
   */
  async set(source: string, query: string, citations: Citation[]): Promise<void> {
    const data = this.getData()
    const key = this.buildKey(source, query)
    const entry: CacheEntry = {
      citations,
      storedAt: Date.now(),
    }
    const updated: KnowledgeCacheData = { ...data, [key]: entry }
    await this.globalState.update(KnowledgeCache.CACHE_KEY, updated)
  }

  /**
   * Checks whether a cache entry has exceeded its TTL.
   */
  isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.storedAt > this.getTtlMs()
  }

  /**
   * Removes all entries from the cache.
   */
  async clear(): Promise<void> {
    await this.globalState.update(KnowledgeCache.CACHE_KEY, {})
  }

  /**
   * Reads the TTL from VS Code configuration.
   * Defaults to 24 hours if not configured.
   */
  private getTtlMs(): number {
    const defaultHours = 24
    const config = vscode.workspace.getConfiguration('mathAgent.rag')
    const hours = config.get<number>('cacheTtlHours') ?? defaultHours
    return hours * 3_600_000
  }

  /**
   * Builds the cache key from source and query.
   */
  private buildKey(source: string, query: string): string {
    return `${source}:${query}`
  }

  /**
   * Retrieves the full cache data from global state.
   */
  private getData(): KnowledgeCacheData {
    return this.globalState.get<KnowledgeCacheData>(KnowledgeCache.CACHE_KEY, {})
  }
}
