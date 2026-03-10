import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { KnowledgeCache } from '../../knowledge/cache'
import { WikipediaClient } from '../../knowledge/wikipedia'
import { Citation } from '../../knowledge/types'
import searchFixture from './fixtures/wikipedia-search.json'
import pageFixture from './fixtures/wikipedia-page.json'

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

/**
 * Creates a mock Response object mimicking the Fetch API.
 */
function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
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
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response
}

describe('WikipediaClient', () => {
  let sandbox: sinon.SinonSandbox
  let cache: KnowledgeCache
  let client: WikipediaClient
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    const memento = createMockMemento()
    cache = new KnowledgeCache(memento)
    fetchStub = sandbox.stub(globalThis, 'fetch')
    client = new WikipediaClient(cache)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('search', () => {
    it('returns Citation[] with correct titles and URLs for search results', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      const results = await client.search('derived category', 5)

      assert.equal(results.length, 2)
      assert.equal(results[0].source, 'wikipedia')
      assert.equal(results[0].title, 'Derived category')
      assert.equal(results[1].source, 'wikipedia')
      assert.equal(results[1].title, 'Derived functor')
    })

    it('formats URLs with spaces replaced by underscores', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      const results = await client.search('derived category', 5)

      assert.equal(results[0].url, 'https://en.wikipedia.org/wiki/Derived_category')
      assert.equal(results[1].url, 'https://en.wikipedia.org/wiki/Derived_functor')
    })

    it('strips HTML tags from snippet', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      const results = await client.search('derived category', 5)

      // Snippets should not contain any HTML tags
      for (const result of results) {
        assert.ok(!/<[^>]+>/.test(result.snippet), `Snippet contains HTML: ${result.snippet}`)
      }
    })

    it('truncates snippet to 500 characters', async () => {
      // Create a fixture with a very long snippet
      const longSnippet = 'A'.repeat(600)
      const longFixture = {
        query: {
          search: [
            {
              title: 'Long Article',
              pageid: 999,
              snippet: longSnippet,
            },
          ],
        },
      }
      fetchStub.resolves(createMockResponse(longFixture))

      const results = await client.search('long', 5)

      assert.ok(results[0].snippet.length <= 500, `Snippet length ${results[0].snippet.length} exceeds 500`)
    })

    it('calls fetch with correct Wikipedia API URL', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      await client.search('derived category', 5)

      assert.equal(fetchStub.callCount, 1)
      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('en.wikipedia.org/w/api.php'), `URL missing base: ${calledUrl}`)
      assert.ok(calledUrl.includes('action=query'), `URL missing action=query: ${calledUrl}`)
      assert.ok(calledUrl.includes('list=search'), `URL missing list=search: ${calledUrl}`)
      assert.ok(calledUrl.includes('srsearch=derived+category') || calledUrl.includes('srsearch=derived%20category'), `URL missing srsearch: ${calledUrl}`)
      assert.ok(calledUrl.includes('srlimit=5'), `URL missing srlimit=5: ${calledUrl}`)
      assert.ok(calledUrl.includes('format=json'), `URL missing format=json: ${calledUrl}`)
    })

    it('sets fetchedAt to a recent timestamp', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))
      const before = Date.now()

      const results = await client.search('derived category', 5)

      const after = Date.now()
      for (const result of results) {
        assert.ok(result.fetchedAt >= before, `fetchedAt ${result.fetchedAt} before ${before}`)
        assert.ok(result.fetchedAt <= after, `fetchedAt ${result.fetchedAt} after ${after}`)
      }
    })

    it('uses default maxResults of 5 when not specified', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      await client.search('derived category')

      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('srlimit=5'), `URL missing default srlimit=5: ${calledUrl}`)
    })
  })

  describe('getPageContent', () => {
    it('fetches and returns a single Citation', async () => {
      fetchStub.resolves(createMockResponse(pageFixture))

      const result = await client.getPageContent('Derived category')

      assert.ok(result !== null && result !== undefined, 'Expected a Citation, got null/undefined')
      assert.equal(result!.source, 'wikipedia')
      assert.equal(result!.title, 'Derived category')
      assert.equal(result!.url, 'https://en.wikipedia.org/wiki/Derived_category')
      assert.ok(result!.snippet.length > 0, 'Snippet should not be empty')
    })

    it('truncates page extract to 500 chars for snippet', async () => {
      // The fixture extract is > 500 chars
      fetchStub.resolves(createMockResponse(pageFixture))

      const result = await client.getPageContent('Derived category')

      assert.ok(result!.snippet.length <= 500, `Snippet length ${result!.snippet.length} exceeds 500`)
    })

    it('calls fetch with correct page content API URL', async () => {
      fetchStub.resolves(createMockResponse(pageFixture))

      await client.getPageContent('Derived category')

      assert.equal(fetchStub.callCount, 1)
      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('prop=extracts'), `URL missing prop=extracts: ${calledUrl}`)
      assert.ok(calledUrl.includes('exintro=true') || calledUrl.includes('exintro=1'), `URL missing exintro: ${calledUrl}`)
      assert.ok(calledUrl.includes('titles=Derived+category') || calledUrl.includes('titles=Derived%20category'), `URL missing titles: ${calledUrl}`)
    })
  })

  describe('caching', () => {
    it('cache hit skips HTTP call on second search', async () => {
      fetchStub.resolves(createMockResponse(searchFixture))

      // First call: should hit network
      const first = await client.search('derived category', 5)
      assert.equal(fetchStub.callCount, 1)

      // Second call: should use cache
      const second = await client.search('derived category', 5)
      assert.equal(fetchStub.callCount, 1, 'fetch should not be called again on cache hit')
      assert.deepEqual(first, second)
    })

    it('different queries result in separate cache entries', async () => {
      const fixture2 = {
        query: {
          search: [
            { title: 'Algebra', pageid: 111, snippet: 'Algebra is...' },
          ],
        },
      }
      fetchStub.onFirstCall().resolves(createMockResponse(searchFixture))
      fetchStub.onSecondCall().resolves(createMockResponse(fixture2))

      await client.search('derived category', 5)
      await client.search('algebra', 5)

      assert.equal(fetchStub.callCount, 2)
    })
  })

  describe('error handling', () => {
    it('non-200 status returns empty array for search', async () => {
      fetchStub.resolves(createMockResponse({}, 500))

      const results = await client.search('derived category', 5)

      assert.deepEqual(results, [])
    })

    it('non-200 status returns null for getPageContent', async () => {
      fetchStub.resolves(createMockResponse({}, 404))

      const result = await client.getPageContent('Nonexistent Page')

      assert.equal(result, null)
    })

    it('network error returns empty array for search', async () => {
      fetchStub.rejects(new Error('Network error'))

      const results = await client.search('derived category', 5)

      assert.deepEqual(results, [])
    })

    it('network error returns null for getPageContent', async () => {
      fetchStub.rejects(new Error('Network error'))

      const result = await client.getPageContent('Some page')

      assert.equal(result, null)
    })
  })

  describe('edge cases', () => {
    it('empty query string still calls API', async () => {
      fetchStub.resolves(createMockResponse({ query: { search: [] } }))

      const results = await client.search('', 5)

      assert.deepEqual(results, [])
      assert.equal(fetchStub.callCount, 1)
    })

    it('maxResults of 0 passes srlimit=0', async () => {
      fetchStub.resolves(createMockResponse({ query: { search: [] } }))

      await client.search('test', 0)

      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.includes('srlimit=0'), `URL missing srlimit=0: ${calledUrl}`)
    })

    it('title with special characters is encoded in URL', async () => {
      const specialFixture = {
        query: {
          pages: {
            '999': {
              pageid: 999,
              title: 'Category (mathematics)',
              extract: 'A category is a collection of objects.',
            },
          },
        },
      }
      fetchStub.resolves(createMockResponse(specialFixture))

      const result = await client.getPageContent('Category (mathematics)')

      assert.ok(result !== null)
      assert.equal(result!.title, 'Category (mathematics)')
      assert.equal(result!.url, 'https://en.wikipedia.org/wiki/Category_(mathematics)')
    })

    it('search results with empty snippet are handled', async () => {
      const emptySnippetFixture = {
        query: {
          search: [
            { title: 'Empty', pageid: 1, snippet: '' },
          ],
        },
      }
      fetchStub.resolves(createMockResponse(emptySnippetFixture))

      const results = await client.search('empty', 5)

      assert.equal(results.length, 1)
      assert.equal(results[0].snippet, '')
    })

    it('page with missing extract returns null', async () => {
      const missingExtractFixture = {
        query: {
          pages: {
            '-1': {
              ns: 0,
              title: 'Nonexistent',
              missing: '',
            },
          },
        },
      }
      fetchStub.resolves(createMockResponse(missingExtractFixture))

      const result = await client.getPageContent('Nonexistent')

      assert.equal(result, null)
    })

    it('response with missing query.search returns empty array', async () => {
      fetchStub.resolves(createMockResponse({ query: {} }))

      const results = await client.search('test', 5)

      assert.deepEqual(results, [])
    })
  })
})
