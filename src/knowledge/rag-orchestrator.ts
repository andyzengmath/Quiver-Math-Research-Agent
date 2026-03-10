import * as vscode from 'vscode'
import { Citation, KnowledgeSourceClient, RagStatus, SourceStatus } from './types'
import { EntityDetector } from './entity-detector'

/**
 * Orchestrates RAG (Retrieval-Augmented Generation) by detecting math entities
 * in user messages and querying multiple knowledge sources in parallel.
 */
export class RagOrchestrator {
  private readonly arxiv: KnowledgeSourceClient
  private readonly wikipedia: KnowledgeSourceClient
  private readonly nlab: KnowledgeSourceClient
  private readonly entityDetector: EntityDetector

  constructor(
    arxiv: KnowledgeSourceClient,
    wikipedia: KnowledgeSourceClient,
    nlab: KnowledgeSourceClient,
    entityDetector: EntityDetector
  ) {
    this.arxiv = arxiv
    this.wikipedia = wikipedia
    this.nlab = nlab
    this.entityDetector = entityDetector
  }

  /**
   * Enriches a message with citations from knowledge sources.
   * Detects math entities, queries all sources in parallel, deduplicates results.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async enrich(message: string, options?: Record<string, unknown>): Promise<RagStatus> {
    const enabled = this.isRagEnabled()

    if (!enabled) {
      return {
        enabled: false,
        sources: { arxiv: 'skipped', wikipedia: 'skipped', nlab: 'skipped' },
        citations: [],
      }
    }

    const entities = await this.entityDetector.detect(message)

    if (entities.length === 0) {
      return {
        enabled: true,
        sources: { arxiv: 'skipped', wikipedia: 'skipped', nlab: 'skipped' },
        citations: [],
      }
    }

    return this.queryAllSources(entities)
  }

  /**
   * Queries all three knowledge sources for each entity in parallel.
   * Uses Promise.allSettled to ensure partial failures don't block results.
   */
  private async queryAllSources(entities: readonly string[]): Promise<RagStatus> {
    const allCitations: Citation[] = []
    let arxivStatus: SourceStatus = 'success'
    let wikipediaStatus: SourceStatus = 'success'
    let nlabStatus: SourceStatus = 'success'

    // For each entity, query all 3 sources in parallel
    const entityPromises = entities.map(async (entity) => {
      const results = await Promise.allSettled([
        this.arxiv.search(entity),
        this.wikipedia.search(entity),
        this.nlab.search(entity),
      ])

      // Process arxiv result
      if (results[0].status === 'fulfilled') {
        allCitations.push(...results[0].value)
      } else {
        arxivStatus = 'failed'
      }

      // Process wikipedia result
      if (results[1].status === 'fulfilled') {
        allCitations.push(...results[1].value)
      } else {
        wikipediaStatus = 'failed'
      }

      // Process nlab result
      if (results[2].status === 'fulfilled') {
        allCitations.push(...results[2].value)
      } else {
        nlabStatus = 'failed'
      }
    })

    await Promise.all(entityPromises)

    const deduplicated = this.deduplicateByUrl(allCitations)

    return {
      enabled: true,
      sources: {
        arxiv: arxivStatus,
        wikipedia: wikipediaStatus,
        nlab: nlabStatus,
      },
      citations: deduplicated,
    }
  }

  /**
   * Removes duplicate citations based on URL.
   * Keeps the first occurrence of each URL.
   */
  private deduplicateByUrl(citations: readonly Citation[]): Citation[] {
    const seen = new Set<string>()
    const result: Citation[] = []

    for (const citation of citations) {
      if (!seen.has(citation.url)) {
        seen.add(citation.url)
        result.push(citation)
      }
    }

    return result
  }

  /**
   * Reads the mathAgent.rag.enabled setting from VS Code configuration.
   */
  private isRagEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('mathAgent.rag')
    return config.get<boolean>('enabled') ?? true
  }
}
