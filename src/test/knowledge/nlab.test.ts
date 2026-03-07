import { strict as assert } from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { KnowledgeCache } from '../../knowledge/cache'
import { NlabClient } from '../../knowledge/nlab'
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

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'nlab-page.html'),
  'utf-8'
)

/**
 * Creates a mock Response object for fetch.
 */
function createMockResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Not Found',
    text: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic' as ResponseType,
    url: '',
    clone: () => createMockResponse(body, status),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    json: () => Promise.resolve({}),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response
}

describe('NlabClient', () => {
  let cache: KnowledgeCache
  let client: NlabClient
  let fetchStub: sinon.SinonStub
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    const memento = createMockMemento()
    cache = new KnowledgeCache(memento)
    client = new NlabClient(cache)
    fetchStub = sinon.stub(globalThis, 'fetch')
    clock = sinon.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false })
  })

  afterEach(() => {
    fetchStub.restore()
    clock.restore()
  })

  describe('getPage', () => {
    it('fetches the correct nLab URL and returns a Citation with nlab source', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('derived+category')

      assert.equal(results.length, 1)
      const citation = results[0]
      assert.equal(citation.source, 'nlab')
      assert.equal(citation.url, 'https://ncatlab.org/nlab/show/derived+category')
      assert.equal(typeof citation.fetchedAt, 'number')

      // Verify fetch was called with the correct URL
      sinon.assert.calledOnce(fetchStub)
      const fetchedUrl = fetchStub.firstCall.args[0]
      assert.equal(fetchedUrl, 'https://ncatlab.org/nlab/show/derived+category')
    })

    it('extracts only #Content div text and strips nav, sidebar, script, and style elements', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('derived+category')
      const citation = results[0]

      // Should contain text from #Content
      assert.ok(citation.snippet.includes('homological algebra'))
      // Should NOT contain nav text
      assert.ok(!citation.snippet.includes('Home'))
      assert.ok(!citation.snippet.includes('All pages'))
      // Should NOT contain sidebar text
      assert.ok(!citation.snippet.includes('Contents'))
      // Should NOT contain footer text
      assert.ok(!citation.snippet.includes('Last revised'))
      // Should NOT contain script content
      assert.ok(!citation.snippet.includes('tracking'))
      // Should NOT contain style content
      assert.ok(!citation.snippet.includes('.hidden'))
      // Internal nav inside #Content should be stripped
      assert.ok(!citation.snippet.includes('Back to top'))
    })

    it('truncates snippet to 500 characters', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('derived+category')
      const citation = results[0]

      assert.ok(citation.snippet.length <= 500)
    })

    it('sets title from page name with + replaced by spaces', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('derived+category')
      const citation = results[0]

      assert.equal(citation.title, 'derived category')
    })

    it('returns empty array on 404 response', async () => {
      fetchStub.resolves(createMockResponse('Not Found', 404))

      const results = await client.getPage('nonexistent+page')

      assert.deepEqual(results, [])
    })

    it('returns empty array on non-200 responses (e.g., 500)', async () => {
      fetchStub.resolves(createMockResponse('Server Error', 500))

      const results = await client.getPage('server+error')

      assert.deepEqual(results, [])
    })

    it('returns empty array when fetch throws a network error', async () => {
      fetchStub.rejects(new Error('Network failure'))

      const results = await client.getPage('network+fail')

      assert.deepEqual(results, [])
    })

    it('uses cache and skips HTTP on cache hit', async () => {
      const cachedCitation: Citation = {
        source: 'nlab',
        title: 'derived category',
        url: 'https://ncatlab.org/nlab/show/derived+category',
        snippet: 'Cached content about derived categories.',
        fetchedAt: Date.now(),
      }
      await cache.set('nlab', 'derived+category', [cachedCitation])

      const results = await client.getPage('derived+category')

      assert.deepEqual(results, [cachedCitation])
      sinon.assert.notCalled(fetchStub)
    })

    it('caches the result after a successful fetch', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      await client.getPage('derived+category')

      // Verify it was cached
      const cached = cache.get('nlab', 'derived+category')
      assert.ok(cached)
      assert.equal(cached!.length, 1)
      assert.equal(cached![0].source, 'nlab')
    })

    it('does not cache 404 results', async () => {
      fetchStub.resolves(createMockResponse('Not Found', 404))

      await client.getPage('nonexistent+page')

      const cached = cache.get('nlab', 'nonexistent+page')
      assert.equal(cached, undefined)
    })
  })

  describe('search', () => {
    it('converts spaces to + and calls getPage', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.search('derived category')

      assert.equal(results.length, 1)
      sinon.assert.calledOnce(fetchStub)
      const fetchedUrl = fetchStub.firstCall.args[0]
      assert.equal(fetchedUrl, 'https://ncatlab.org/nlab/show/derived+category')
    })

    it('handles query that already contains +', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.search('derived+category')

      assert.equal(results.length, 1)
      sinon.assert.calledOnce(fetchStub)
      const fetchedUrl = fetchStub.firstCall.args[0]
      assert.equal(fetchedUrl, 'https://ncatlab.org/nlab/show/derived+category')
    })

    it('returns empty array when page not found', async () => {
      fetchStub.resolves(createMockResponse('Not Found', 404))

      const results = await client.search('nonexistent page')

      assert.deepEqual(results, [])
    })
  })

  describe('rate limiting', () => {
    it('enforces minimum 5 second interval between requests', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      // First call should succeed immediately
      await client.getPage('page1')
      sinon.assert.calledOnce(fetchStub)

      // Second call immediately after should be delayed
      // Advance time by only 1 second (not enough)
      clock.tick(1000)
      const secondCall = client.getPage('page2')

      // Advance time enough for rate limiter to allow the request
      clock.tick(4000)
      await secondCall

      sinon.assert.calledTwice(fetchStub)
    })

    it('allows request immediately if enough time has passed', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      await client.getPage('page1')

      // Advance time by 5+ seconds
      clock.tick(5001)

      await client.getPage('page2')
      sinon.assert.calledTwice(fetchStub)
    })

    it('rate limiter does not apply to cache hits', async () => {
      const cachedCitation: Citation = {
        source: 'nlab',
        title: 'cached page',
        url: 'https://ncatlab.org/nlab/show/cached+page',
        snippet: 'Cached.',
        fetchedAt: Date.now(),
      }
      await cache.set('nlab', 'cached+page', [cachedCitation])

      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      // First call - cache hit, no fetch
      await client.getPage('cached+page')
      sinon.assert.notCalled(fetchStub)

      // Second call immediately - different page, needs fetch
      // Should not be blocked by rate limiter since the cache hit didn't count
      await client.getPage('other+page')
      sinon.assert.calledOnce(fetchStub)
    })
  })

  describe('edge cases', () => {
    it('handles empty page name', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('')

      // Should still attempt the fetch (server will handle it)
      assert.ok(Array.isArray(results))
    })

    it('handles HTML with no #Content div', async () => {
      const htmlNoContent = '<html><body><p>No content div here</p></body></html>'
      fetchStub.resolves(createMockResponse(htmlNoContent, 200))

      const results = await client.getPage('bad+page')

      // Should return empty array since no #Content div found
      assert.deepEqual(results, [])
    })

    it('handles HTML with empty #Content div', async () => {
      const htmlEmptyContent = '<html><body><div id="Content"></div></body></html>'
      fetchStub.resolves(createMockResponse(htmlEmptyContent, 200))

      const results = await client.getPage('empty+page')

      // Empty content should return empty array
      assert.deepEqual(results, [])
    })

    it('handles page name with special characters', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('(%E2%88%9E,1)-category')

      assert.equal(results.length, 1)
      sinon.assert.calledOnce(fetchStub)
      const fetchedUrl = fetchStub.firstCall.args[0]
      assert.equal(fetchedUrl, 'https://ncatlab.org/nlab/show/(%E2%88%9E,1)-category')
    })

    it('snippet is exactly 500 chars when content exceeds 500', async () => {
      // The fixture HTML has content longer than 500 chars
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      const results = await client.getPage('derived+category')
      const citation = results[0]

      // Content in fixture is long enough; snippet should be exactly 500
      assert.equal(citation.snippet.length, 500)
    })

    it('snippet is full text when content is under 500 chars', async () => {
      const shortHtml = '<html><body><div id="Content"><p>Short text</p></div></body></html>'
      fetchStub.resolves(createMockResponse(shortHtml, 200))

      const results = await client.getPage('short+page')
      const citation = results[0]

      assert.ok(citation.snippet.length < 500)
      assert.ok(citation.snippet.includes('Short text'))
    })

    it('search with multiple consecutive spaces normalizes to single +', async () => {
      fetchStub.resolves(createMockResponse(fixtureHtml, 200))

      await client.search('derived  category')

      const fetchedUrl = fetchStub.firstCall.args[0]
      // Multiple spaces should be replaced with single +
      assert.equal(fetchedUrl, 'https://ncatlab.org/nlab/show/derived+category')
    })
  })
})
