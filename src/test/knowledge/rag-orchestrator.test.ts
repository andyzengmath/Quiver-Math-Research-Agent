import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { RagOrchestrator } from '../../knowledge/rag-orchestrator'
import { EntityDetector } from '../../knowledge/entity-detector'
import { Citation, KnowledgeSourceClient } from '../../knowledge/types'

/**
 * Creates a mock knowledge source client (ArxivClient, WikipediaClient, or NlabClient).
 */
function createMockClient(
  source: 'arxiv' | 'wikipedia' | 'nlab',
  results: Citation[] = []
): KnowledgeSourceClient {
  return {
    search: sinon.stub().resolves(results),
  }
}

/**
 * Creates a mock EntityDetector with a stubbed detect method.
 */
function createMockDetector(entities: string[] = []): EntityDetector {
  const detector = Object.create(EntityDetector.prototype) as EntityDetector
  ;(detector as unknown as { detect: sinon.SinonStub }).detect = sinon
    .stub()
    .resolves(entities)
  return detector
}

/**
 * Creates a sample Citation for testing.
 */
function makeCitation(overrides: Partial<Citation> = {}): Citation {
  return {
    source: 'arxiv',
    title: 'Test Paper',
    url: 'https://arxiv.org/abs/1234.5678',
    snippet: 'A test citation snippet.',
    fetchedAt: Date.now(),
    ...overrides,
  }
}

describe('RagOrchestrator', () => {
  let arxiv: KnowledgeSourceClient
  let wikipedia: KnowledgeSourceClient
  let nlab: KnowledgeSourceClient
  let detector: EntityDetector
  let orchestrator: RagOrchestrator
  let configStub: sinon.SinonStub

  beforeEach(() => {
    // Default: all sources return distinct citations
    arxiv = createMockClient('arxiv', [
      makeCitation({
        source: 'arxiv',
        title: 'Spectral Sequences in Algebra',
        url: 'https://arxiv.org/abs/2301.00001',
      }),
    ])
    wikipedia = createMockClient('wikipedia', [
      makeCitation({
        source: 'wikipedia',
        title: 'Spectral sequence',
        url: 'https://en.wikipedia.org/wiki/Spectral_sequence',
      }),
    ])
    nlab = createMockClient('nlab', [
      makeCitation({
        source: 'nlab',
        title: 'spectral sequence',
        url: 'https://ncatlab.org/nlab/show/spectral+sequence',
      }),
    ])
    detector = createMockDetector(['spectral sequence'])

    // Stub vscode.workspace.getConfiguration to return rag.enabled = true
    configStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: (key: string) => {
        if (key === 'enabled') {
          return true
        }
        return undefined
      },
      has: () => false,
      inspect: () => undefined,
      update: () => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration)

    orchestrator = new RagOrchestrator(arxiv, wikipedia, nlab, detector)
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('enrich', () => {
    it('detects entities and queries all 3 sources in parallel', async () => {
      const result = await orchestrator.enrich('Consider the spectral sequence')

      // Verify entity detection was called
      const detectStub = (detector as unknown as { detect: sinon.SinonStub }).detect
      assert.equal(detectStub.calledOnce, true)
      assert.equal(detectStub.firstCall.args[0], 'Consider the spectral sequence')

      // Verify all 3 sources were queried
      const arxivSearch = arxiv.search as sinon.SinonStub
      const wikiSearch = wikipedia.search as sinon.SinonStub
      const nlabSearch = nlab.search as sinon.SinonStub
      assert.equal(arxivSearch.called, true)
      assert.equal(wikiSearch.called, true)
      assert.equal(nlabSearch.called, true)

      // Verify citations from all sources are present
      assert.equal(result.citations.length, 3)
      assert.equal(result.enabled, true)
    })

    it('returns deduplicated Citation[] (no duplicate URLs)', async () => {
      // Set up arxiv and wikipedia to return the same URL
      const duplicateUrl = 'https://example.com/same-paper'
      const arxivWithDup = createMockClient('arxiv', [
        makeCitation({ source: 'arxiv', url: duplicateUrl, title: 'Paper A' }),
        makeCitation({ source: 'arxiv', url: 'https://arxiv.org/abs/unique1', title: 'Unique 1' }),
      ])
      const wikiWithDup = createMockClient('wikipedia', [
        makeCitation({ source: 'wikipedia', url: duplicateUrl, title: 'Paper B' }),
      ])
      const nlabNoDup = createMockClient('nlab', [
        makeCitation({ source: 'nlab', url: 'https://ncatlab.org/unique2', title: 'Unique 2' }),
      ])

      const orch = new RagOrchestrator(arxivWithDup, wikiWithDup, nlabNoDup, detector)
      const result = await orch.enrich('Consider the spectral sequence')

      // Should have 3 citations (not 4) because one URL is duplicated
      assert.equal(result.citations.length, 3)
      const urls = result.citations.map((c: Citation) => c.url)
      const uniqueUrls = [...new Set(urls)]
      assert.equal(urls.length, uniqueUrls.length)
    })

    it('returns ragStatus with per-source success status', async () => {
      const result = await orchestrator.enrich('Consider the spectral sequence')

      assert.equal(result.enabled, true)
      assert.equal(result.sources.arxiv, 'success')
      assert.equal(result.sources.wikipedia, 'success')
      assert.equal(result.sources.nlab, 'success')
    })

    it('when nLab fails, continues with arxiv+wikipedia and marks nlab as failed', async () => {
      const failingNlab: KnowledgeSourceClient = {
        search: sinon.stub().rejects(new Error('nLab is down')),
      }

      const orch = new RagOrchestrator(arxiv, wikipedia, failingNlab, detector)
      const result = await orch.enrich('Consider the spectral sequence')

      // Should still have citations from arxiv and wikipedia
      assert.equal(result.citations.length, 2)
      assert.equal(result.sources.arxiv, 'success')
      assert.equal(result.sources.wikipedia, 'success')
      assert.equal(result.sources.nlab, 'failed')
    })

    it('when rag.enabled is false, returns empty citations and ragStatus.enabled=false', async () => {
      configStub.returns({
        get: (key: string) => {
          if (key === 'enabled') {
            return false
          }
          return undefined
        },
        has: () => false,
        inspect: () => undefined,
        update: () => Promise.resolve(),
      } as unknown as vscode.WorkspaceConfiguration)

      const result = await orchestrator.enrich('Consider the spectral sequence')

      assert.equal(result.enabled, false)
      assert.equal(result.citations.length, 0)
      assert.equal(result.sources.arxiv, 'skipped')
      assert.equal(result.sources.wikipedia, 'skipped')
      assert.equal(result.sources.nlab, 'skipped')

      // No source queries should have been made
      const arxivSearch = arxiv.search as sinon.SinonStub
      assert.equal(arxivSearch.called, false)
    })

    it('when EntityDetector returns empty, no source queries are made', async () => {
      const emptyDetector = createMockDetector([])
      const orch = new RagOrchestrator(arxiv, wikipedia, nlab, emptyDetector)
      const result = await orch.enrich('Hello world, no math here')

      assert.equal(result.citations.length, 0)
      assert.equal(result.sources.arxiv, 'skipped')
      assert.equal(result.sources.wikipedia, 'skipped')
      assert.equal(result.sources.nlab, 'skipped')

      const arxivSearch = arxiv.search as sinon.SinonStub
      const wikiSearch = wikipedia.search as sinon.SinonStub
      const nlabSearch = nlab.search as sinon.SinonStub
      assert.equal(arxivSearch.called, false)
      assert.equal(wikiSearch.called, false)
      assert.equal(nlabSearch.called, false)
    })
  })

  describe('edge cases', () => {
    it('handles empty message string', async () => {
      const emptyDetector = createMockDetector([])
      const orch = new RagOrchestrator(arxiv, wikipedia, nlab, emptyDetector)
      const result = await orch.enrich('')

      assert.equal(result.citations.length, 0)
      assert.equal(result.enabled, true)
    })

    it('handles multiple entities by querying sources for each', async () => {
      const multiDetector = createMockDetector(['group', 'ring'])
      const orch = new RagOrchestrator(arxiv, wikipedia, nlab, multiDetector)
      await orch.enrich('The group and ring are related')

      // Each entity triggers search on all 3 sources
      const arxivSearch = arxiv.search as sinon.SinonStub
      assert.equal(arxivSearch.callCount, 2)
    })

    it('handles all sources failing gracefully', async () => {
      const failingArxiv: KnowledgeSourceClient = {
        search: sinon.stub().rejects(new Error('arxiv down')),
      }
      const failingWiki: KnowledgeSourceClient = {
        search: sinon.stub().rejects(new Error('wiki down')),
      }
      const failingNlab: KnowledgeSourceClient = {
        search: sinon.stub().rejects(new Error('nlab down')),
      }

      const orch = new RagOrchestrator(failingArxiv, failingWiki, failingNlab, detector)
      const result = await orch.enrich('Consider the spectral sequence')

      assert.equal(result.citations.length, 0)
      assert.equal(result.sources.arxiv, 'failed')
      assert.equal(result.sources.wikipedia, 'failed')
      assert.equal(result.sources.nlab, 'failed')
    })

    it('deduplicates across entities for the same URL', async () => {
      const multiDetector = createMockDetector(['spectral sequence', 'homology'])
      const sameUrlArxiv = createMockClient('arxiv', [
        makeCitation({ source: 'arxiv', url: 'https://arxiv.org/abs/same' }),
      ])

      const orch = new RagOrchestrator(sameUrlArxiv, wikipedia, nlab, multiDetector)
      const result = await orch.enrich('spectral sequence and homology')

      // The same arxiv URL returned for both entities should be deduplicated
      const arxivCitations = result.citations.filter((c: Citation) => c.source === 'arxiv')
      const arxivUrls = arxivCitations.map((c: Citation) => c.url)
      const uniqueArxivUrls = [...new Set(arxivUrls)]
      assert.equal(arxivUrls.length, uniqueArxivUrls.length)
    })
  })
})
