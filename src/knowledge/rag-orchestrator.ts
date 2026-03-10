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
    // Collect results per-entity first, then merge to avoid concurrent overwrites
    interface EntityResult {
      readonly citations: Citation[]
      readonly arxivFailed: boolean
      readonly wikipediaFailed: boolean
      readonly nlabFailed: boolean
    }

    const entityPromises = entities.map(async (entity): Promise<EntityResult> => {
      const results = await Promise.allSettled([
        this.arxiv.search(entity),
        this.wikipedia.search(entity),
        this.nlab.search(entity),
      ])

      const citations: Citation[] = []
      let arxivFailed = false
      let wikipediaFailed = false
      let nlabFailed = false

      if (results[0].status === 'fulfilled') {
        citations.push(...results[0].value)
      } else {
        arxivFailed = true
      }

      if (results[1].status === 'fulfilled') {
        citations.push(...results[1].value)
      } else {
        wikipediaFailed = true
      }

      if (results[2].status === 'fulfilled') {
        citations.push(...results[2].value)
      } else {
        nlabFailed = true
      }

      return { citations, arxivFailed, wikipediaFailed, nlabFailed }
    })

    const entityResults = await Promise.all(entityPromises)

    // Merge all entity results
    const allCitations: Citation[] = []
    let arxivStatus: SourceStatus = 'success'
    let wikipediaStatus: SourceStatus = 'success'
    let nlabStatus: SourceStatus = 'success'

    for (const result of entityResults) {
      allCitations.push(...result.citations)
      if (result.arxivFailed) {
        arxivStatus = 'failed'
      }
      if (result.wikipediaFailed) {
        wikipediaStatus = 'failed'
      }
      if (result.nlabFailed) {
        nlabStatus = 'failed'
      }
    }

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
