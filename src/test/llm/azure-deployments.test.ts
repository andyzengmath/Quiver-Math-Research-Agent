import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import { listAzureDeployments } from '../../llm/azure-deployments'

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

describe('listAzureDeployments', () => {
  let sandbox: sinon.SinonSandbox
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    fetchStub = sandbox.stub(globalThis, 'fetch')
  })

  afterEach(() => {
    sandbox.restore()
  })

  const endpoint = 'https://my-resource.openai.azure.com'
  const apiVersion = '2024-12-01-preview'

  const sampleDeployments = {
    data: [
      {
        id: 'dep-1',
        model: 'gpt-4',
        status: 'succeeded',
        // extra fields that should be ignored
        owner: 'organization',
        created_at: 1234567890,
      },
      {
        id: 'dep-2',
        model: 'gpt-5.4',
        status: 'succeeded',
      },
      {
        id: 'dep-3',
        model: 'text-embedding-ada-002',
        status: 'failed',
      },
    ],
  }

  describe('authentication headers', () => {
    it('sends GET with api-key header when auth type is api-key', async () => {
      fetchStub.resolves(createMockResponse({ data: [] }))

      await listAzureDeployments(endpoint, { type: 'api-key', apiKey: 'test-key-123' }, apiVersion)

      assert.equal(fetchStub.callCount, 1)
      const [url, options] = fetchStub.firstCall.args
      assert.equal(url, `${endpoint}/openai/deployments?api-version=${apiVersion}`)
      assert.equal(options.method, 'GET')
      assert.equal(options.headers['api-key'], 'test-key-123')
      assert.equal(options.headers['Authorization'], undefined)
    })

    it('sends GET with Bearer token when auth type is bearer', async () => {
      fetchStub.resolves(createMockResponse({ data: [] }))

      await listAzureDeployments(endpoint, { type: 'bearer', token: 'eyJ0eXAi...' }, apiVersion)

      assert.equal(fetchStub.callCount, 1)
      const [url, options] = fetchStub.firstCall.args
      assert.equal(url, `${endpoint}/openai/deployments?api-version=${apiVersion}`)
      assert.equal(options.method, 'GET')
      assert.equal(options.headers['Authorization'], 'Bearer eyJ0eXAi...')
      assert.equal(options.headers['api-key'], undefined)
    })
  })

  describe('response parsing', () => {
    it('parses response.data into Array<{name, model, status}>', async () => {
      fetchStub.resolves(createMockResponse(sampleDeployments))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.equal(result.length, 3)
      assert.deepStrictEqual(result[0], { name: 'dep-1', model: 'gpt-4', status: 'succeeded' })
      assert.deepStrictEqual(result[1], { name: 'dep-2', model: 'gpt-5.4', status: 'succeeded' })
      assert.deepStrictEqual(result[2], { name: 'dep-3', model: 'text-embedding-ada-002', status: 'failed' })
    })

    it('returns empty array when response.data is empty', async () => {
      fetchStub.resolves(createMockResponse({ data: [] }))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })
  })

  describe('error handling', () => {
    it('returns empty array on 403 Forbidden', async () => {
      fetchStub.resolves(createMockResponse({ error: { message: 'Forbidden' } }, 403))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'bad-key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('returns empty array on network error', async () => {
      fetchStub.rejects(new Error('Network error: ECONNREFUSED'))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('returns empty array on 500 server error', async () => {
      fetchStub.resolves(createMockResponse({ error: 'Internal Server Error' }, 500))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('returns empty array on 401 Unauthorized', async () => {
      fetchStub.resolves(createMockResponse({ error: 'Unauthorized' }, 401))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'bearer', token: 'expired-token' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })
  })

  describe('deployment filtering', () => {
    it('filters deployments by status when filter is provided', async () => {
      fetchStub.resolves(createMockResponse(sampleDeployments))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion,
        { status: 'succeeded' }
      )

      assert.equal(result.length, 2)
      assert.deepStrictEqual(result[0], { name: 'dep-1', model: 'gpt-4', status: 'succeeded' })
      assert.deepStrictEqual(result[1], { name: 'dep-2', model: 'gpt-5.4', status: 'succeeded' })
    })

    it('returns all deployments when no filter is provided', async () => {
      fetchStub.resolves(createMockResponse(sampleDeployments))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.equal(result.length, 3)
    })
  })

  describe('edge cases', () => {
    it('returns empty array when response body has no data field', async () => {
      fetchStub.resolves(createMockResponse({ items: [] }))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('returns empty array when response body is null', async () => {
      fetchStub.resolves(createMockResponse(null))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('returns empty array when data contains entries without id field', async () => {
      fetchStub.resolves(createMockResponse({
        data: [
          { model: 'gpt-4', status: 'succeeded' },
        ],
      }))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('handles endpoint with trailing slash', async () => {
      fetchStub.resolves(createMockResponse({ data: [] }))

      await listAzureDeployments(
        'https://my-resource.openai.azure.com/',
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      const [url] = fetchStub.firstCall.args
      // Should not double-slash
      assert.ok(!url.includes('.com//'), `URL should not contain double slash: ${url}`)
      assert.ok(url.includes('/openai/deployments'))
    })

    it('returns empty array when data is not an array', async () => {
      fetchStub.resolves(createMockResponse({ data: 'not-an-array' }))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('handles empty string endpoint gracefully', async () => {
      fetchStub.rejects(new TypeError('Invalid URL'))

      const result = await listAzureDeployments(
        '',
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      assert.deepStrictEqual(result, [])
    })

    it('skips entries with null or undefined model', async () => {
      fetchStub.resolves(createMockResponse({
        data: [
          { id: 'dep-1', model: null, status: 'succeeded' },
          { id: 'dep-2', model: 'gpt-4', status: 'succeeded' },
          { id: 'dep-3', status: 'succeeded' },
        ],
      }))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion
      )

      // Only dep-2 has all required fields
      assert.equal(result.length, 1)
      assert.deepStrictEqual(result[0], { name: 'dep-2', model: 'gpt-4', status: 'succeeded' })
    })

    it('filter with status that matches nothing returns empty array', async () => {
      fetchStub.resolves(createMockResponse(sampleDeployments))

      const result = await listAzureDeployments(
        endpoint,
        { type: 'api-key', apiKey: 'key' },
        apiVersion,
        { status: 'pending' }
      )

      assert.deepStrictEqual(result, [])
    })
  })
})
