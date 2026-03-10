import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { ArxivClient } from '../../knowledge/arxiv'
import { KnowledgeCache } from '../../knowledge/cache'
import { Citation } from '../../knowledge/types'

/**
 * Creates a mock vscode.Memento for testing.
 */
function createMockMemento(): vscode.Memento {
  const store = new Map<string, unknown>()
  return {
    keys: () => Array.from(store.keys()),
    get<T>(key: string, defaultValue?: T): T {
      if (store.has(key)) {
        return store.get(key) as T
      }
      return defaultValue as T
    },
    async update(key: string, value: unknown): Promise<void> {
      store.set(key, value)
    },
  }
}

const fixtureXml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'arxiv-response.xml'),
  'utf-8'
)

describe('ArxivClient', () => {
  let cache: KnowledgeCache
  let client: ArxivClient
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    cache = new KnowledgeCache(createMockMemento())
    client = new ArxivClient(cache)
    fetchStub = sinon.stub(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchStub.restore()
    sinon.restore()
  })

  /**
   * Helper to stub a successful arXiv response with the fixture XML.
   * Returns a new Response for each call to avoid "Body already read" errors.
   */
  function stubSuccessResponse(): void {
    fetchStub.callsFake(() =>
      Promise.resolve(new Response(fixtureXml, { status: 200 }))
    )
  }

  /**
   * Helper to stub a server error response.
   */
  function stubErrorResponse(status: number): void {
    fetchStub.callsFake(() =>
      Promise.resolve(new Response('Internal Server Error', { status }))
    )
  }

  describe('search parsing', () => {
    it('parses XML into 2 Citation objects with correct fields', async () => {
      stubSuccessResponse()
      const results = await client.search('homological stability', 5)

      assert.equal(results.length, 2)

      assert.equal(results[0].source, 'arxiv')
      assert.equal(results[0].title, 'Homological Stability for Moduli Spaces of Manifolds')
      assert.equal(typeof results[0].fetchedAt, 'number')

      assert.equal(results[1].source, 'arxiv')
      assert.equal(results[1].title, 'On the Homological Stability of Configuration Spaces')
      assert.equal(typeof results[1].fetchedAt, 'number')
    })

    it('Citation.url is the abs link', async () => {
      stubSuccessResponse()
      const results = await client.search('homological stability', 5)

      assert.equal(results[0].url, 'http://arxiv.org/abs/2301.12345v1')
      assert.equal(results[1].url, 'http://arxiv.org/abs/2302.67890v2')
    })

    it('Citation.snippet is abstract truncated to 500 chars', async () => {
      stubSuccessResponse()
      const results = await client.search('homological stability', 5)

      // First entry summary is under 500 chars, should be complete
      assert.ok(results[0].snippet.length <= 500)

      // Second entry summary is over 500 chars, should be truncated
      assert.ok(results[1].snippet.length <= 500)
      // The second entry's full summary is longer than 500 characters
      // so it should be exactly 500 chars (truncated)
    })

    it('Citation.bibtex contains @article with correct fields', async () => {
      stubSuccessResponse()
      const results = await client.search('homological stability', 5)

      const bibtex0 = results[0].bibtex
      assert.ok(bibtex0, 'bibtex should be defined')
      assert.ok(bibtex0!.includes('@article{'), 'should contain @article')
      assert.ok(bibtex0!.includes('2301.12345'), 'should contain arxiv ID')
      assert.ok(
        bibtex0!.includes('Homological Stability for Moduli Spaces of Manifolds'),
        'should contain title'
      )
      assert.ok(bibtex0!.includes('Randal-Williams'), 'should contain author')
      assert.ok(bibtex0!.includes('2023'), 'should contain year')
      assert.ok(bibtex0!.includes('arXiv preprint'), 'should contain journal')
      assert.ok(bibtex0!.includes('eprint'), 'should contain eprint field')

      const bibtex1 = results[1].bibtex
      assert.ok(bibtex1, 'second bibtex should be defined')
      assert.ok(bibtex1!.includes('2302.67890'), 'should contain second arxiv ID')
      assert.ok(bibtex1!.includes('Palmer'), 'should contain second author')
    })
  })

  describe('caching', () => {
    it('when cache has results for query, HTTP is not called', async () => {
      // Pre-populate cache
      const cachedCitations: Citation[] = [
        {
          source: 'arxiv',
          title: 'Cached Paper',
          url: 'http://arxiv.org/abs/0000.00000',
          snippet: 'cached snippet',
          fetchedAt: Date.now(),
        },
      ]
      await cache.set('arxiv', 'homological stability', cachedCitations)

      const results = await client.search('homological stability', 5)

      assert.equal(fetchStub.callCount, 0, 'fetch should not be called when cache hit')
      assert.deepEqual(results, cachedCitations)
    })
  })

  describe('error handling', () => {
    it('when arXiv returns 500, returns empty array and does not throw', async () => {
      stubErrorResponse(500)
      const results = await client.search('homological stability', 5)

      assert.deepEqual(results, [])
    })

    it('when arXiv returns 403, returns empty array and does not throw', async () => {
      stubErrorResponse(403)
      const results = await client.search('some query', 5)

      assert.deepEqual(results, [])
    })

    it('when fetch throws a network error, returns empty array', async () => {
      fetchStub.rejects(new Error('Network error'))
      const results = await client.search('some query', 5)

      assert.deepEqual(results, [])
    })
  })

  describe('rate limiting', () => {
    it('rate limiter prevents calls faster than 1 per 3 seconds', async () => {
      stubSuccessResponse()

      // First call should go through immediately
      const startTime = Date.now()
      await client.search('query1', 5)

      // Second call should be delayed by the rate limiter
      const results = await client.search('query2', 5)
      const endTime = Date.now()

      // Both calls should have been made successfully
      assert.equal(fetchStub.callCount, 2, 'fetch should be called twice')
      assert.equal(results.length, 2, 'second search should return valid results')

      // The total time should be at least 3 seconds due to rate limiting
      const elapsed = endTime - startTime
      assert.ok(
        elapsed >= 2900,
        `Total elapsed time should be >= 3s due to rate limiting, got ${elapsed}ms`
      )
    })
  })

  describe('edge cases', () => {
    it('search with empty query returns results from arXiv', async () => {
      stubSuccessResponse()
      const results = await client.search('', 5)

      // Should still call fetch and return results
      assert.equal(fetchStub.callCount, 1)
      assert.equal(results.length, 2)
    })

    it('search with maxResults=0 passes parameter to API', async () => {
      stubSuccessResponse()
      await client.search('test', 0)

      assert.equal(fetchStub.callCount, 1)
      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('max_results=0'))
    })

    it('default maxResults is 10', async () => {
      stubSuccessResponse()
      await client.search('test')

      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('max_results=10'))
    })

    it('constructs correct API URL with encoded query', async () => {
      stubSuccessResponse()
      await client.search('homological stability', 5)

      assert.equal(fetchStub.callCount, 1)
      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(
        calledUrl.startsWith('https://export.arxiv.org/api/query'),
        'should use export.arxiv.org'
      )
      assert.ok(calledUrl.includes('search_query='), 'should include search_query')
      assert.ok(calledUrl.includes('max_results=5'), 'should include max_results')
    })

    it('handles XML with single entry (not array)', async () => {
      // arXiv returns a single entry object (not array) when there is only one result
      const singleEntryXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.11111v1</id>
    <published>2023-01-15T10:00:00Z</published>
    <title>Single Result Paper</title>
    <summary>A short abstract.</summary>
    <author><name>Jane Doe</name></author>
  </entry>
</feed>`
      fetchStub.resolves(new Response(singleEntryXml, { status: 200 }))

      const results = await client.search('single result', 1)
      assert.equal(results.length, 1)
      assert.equal(results[0].title, 'Single Result Paper')
    })

    it('handles XML with no entries (empty results)', async () => {
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
</feed>`
      fetchStub.resolves(new Response(emptyXml, { status: 200 }))

      const results = await client.search('nonexistent topic xyz', 5)
      assert.deepEqual(results, [])
    })

    it('handles entry with multiple authors in bibtex', async () => {
      stubSuccessResponse()
      const results = await client.search('homological stability', 5)

      // First entry has 2 authors
      const bibtex = results[0].bibtex!
      assert.ok(bibtex.includes('Randal-Williams'), 'should include first author')
      assert.ok(bibtex.includes('Kupers'), 'should include second author')
    })
  })
})
