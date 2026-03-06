import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmService } from '../../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions, LlmRateLimitError } from '../../../llm/types'
import { OpenAiProvider } from '../../../llm/providers/openai'
import { createMockExtensionContext } from '../../mock-vscode'

/**
 * Helper: collect all chunks from an AsyncIterable into a string array.
 */
async function collectChunks(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

/**
 * Creates a mock async iterable stream that yields ChatCompletionChunk-like objects.
 */
function createMockStream(deltas: Array<{ content: string | null | undefined }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const delta of deltas) {
        yield {
          choices: [{ delta: { content: delta.content } }],
        }
      }
    },
  }
}

/**
 * Creates a mock OpenAI client with a stubbed chat.completions.create method.
 */
function createMockOpenAiClient(createStub: sinon.SinonStub) {
  return {
    chat: {
      completions: {
        create: createStub,
      },
    },
  }
}

describe('OpenAiProvider', () => {
  let sandbox: sinon.SinonSandbox
  let llmService: LlmService
  let mockContext: vscode.ExtensionContext
  let cancellationTokenSource: vscode.CancellationTokenSource

  const defaultMessages: LlmMessage[] = [{ role: 'user', content: 'Hello' }]
  const defaultOptions: LlmOptions = {}

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockContext = createMockExtensionContext() as unknown as vscode.ExtensionContext
    llmService = new LlmService(mockContext)
    cancellationTokenSource = new vscode.CancellationTokenSource()
  })

  afterEach(() => {
    sandbox.restore()
    cancellationTokenSource.dispose()
  })

  describe('sendMessage - streaming', () => {
    it('creates chat completion stream and yields delta content chunks', async () => {
      // Arrange: store API key
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'Hello' },
          { content: ' world' },
          { content: '!' },
        ])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      // Act
      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      // Assert
      assert.deepEqual(chunks, ['Hello', ' world', '!'])
      assert.equal(createStub.callCount, 1)
      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.stream, true)
      assert.deepEqual(callArgs.messages, [{ role: 'user', content: 'Hello' }])
    })

    it('skips chunks with null or undefined delta content', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'A' },
          { content: null },
          { content: undefined },
          { content: 'B' },
        ])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['A', 'B'])
    })
  })

  describe('authentication errors', () => {
    it('throws LlmAuthError with provider "openai" when API key is missing from SecretStorage', async () => {
      // Do not set any API key
      const createStub = sandbox.stub()
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach here
          }
        },
        (err: Error) => {
          assert.ok(err instanceof LlmAuthError, `Expected LlmAuthError, got ${err.constructor.name}`)
          assert.equal((err as LlmAuthError).provider, 'openai')
          return true
        }
      )

      // Verify OpenAI client was never called
      assert.equal(createStub.callCount, 0)
    })

    it('throws LlmAuthError when OpenAI returns 401', async () => {
      await llmService.setApiKey('openai', 'sk-invalid-key')
      const apiError = new Error('Incorrect API key provided')
      Object.assign(apiError, { status: 401 })
      const createStub = sandbox.stub().rejects(apiError)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach here
          }
        },
        (err: Error) => {
          assert.ok(err instanceof LlmAuthError, `Expected LlmAuthError, got ${err.constructor.name}`)
          assert.equal((err as LlmAuthError).provider, 'openai')
          return true
        }
      )
    })
  })

  describe('rate limit errors', () => {
    it('throws LlmRateLimitError with retryAfterMs when OpenAI returns 429', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const rateLimitError = new Error('Rate limit exceeded')
      Object.assign(rateLimitError, {
        status: 429,
        headers: { 'retry-after': '2' },
      })
      const createStub = sandbox.stub().rejects(rateLimitError)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach here
          }
        },
        (err: Error) => {
          assert.ok(err instanceof LlmRateLimitError, `Expected LlmRateLimitError, got ${err.constructor.name}`)
          assert.equal((err as LlmRateLimitError).retryAfterMs, 2000)
          return true
        }
      )
    })

    it('throws LlmRateLimitError without retryAfterMs when no retry-after header', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const rateLimitError = new Error('Rate limit exceeded')
      Object.assign(rateLimitError, { status: 429 })
      const createStub = sandbox.stub().rejects(rateLimitError)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach here
          }
        },
        (err: Error) => {
          assert.ok(err instanceof LlmRateLimitError, `Expected LlmRateLimitError, got ${err.constructor.name}`)
          assert.equal((err as LlmRateLimitError).retryAfterMs, undefined)
          return true
        }
      )
    })
  })

  describe('model configuration', () => {
    it('uses model from options when provided', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const options: LlmOptions = { model: 'gpt-4o-mini' }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.model, 'gpt-4o-mini')
    })

    it('uses config setting model when options.model is not provided', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockOpenAiClient(createStub)

      // Stub vscode.workspace.getConfiguration to return a specific model
      const getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns({
        get: (key: string) => {
          if (key === 'openaiModel') {
            return 'gpt-5.4'
          }
          return undefined
        },
        update: () => Promise.resolve(),
      } as unknown as vscode.WorkspaceConfiguration)

      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.model, 'gpt-5.4')
      getConfigStub.restore()
    })

    it('falls back to default model when neither options nor config provide one', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      // Should use some default model
      assert.ok(typeof callArgs.model === 'string' && callArgs.model.length > 0,
        `Expected a non-empty model string, got "${callArgs.model}"`)
    })
  })

  describe('provider id', () => {
    it('has id "openai"', () => {
      const provider = new OpenAiProvider(llmService)
      assert.equal(provider.id, 'openai')
    })
  })

  describe('edge cases', () => {
    it('handles empty stream with no chunks', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const emptyStream = {
        async *[Symbol.asyncIterator]() {
          // yields nothing
        },
      }
      const createStub = sandbox.stub().resolves(emptyStream)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, [])
    })

    it('handles chunks with empty string content', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: '' },
          { content: 'data' },
          { content: '' },
        ])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      // Empty strings are valid content, should be yielded
      assert.deepEqual(chunks, ['', 'data', ''])
    })

    it('handles chunks with missing choices array', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const stream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [] }
          yield { choices: [{ delta: { content: 'ok' } }] }
        },
      }
      const createStub = sandbox.stub().resolves(stream)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['ok'])
    })

    it('passes maxTokens and temperature options to OpenAI', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      const options: LlmOptions = { model: 'gpt-4o', maxTokens: 1000, temperature: 0.7 }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.max_tokens, 1000)
      assert.equal(callArgs.temperature, 0.7)
    })

    it('re-throws unknown errors without mapping', async () => {
      await llmService.setApiKey('openai', 'sk-test-key')
      const unknownError = new Error('Something unexpected')
      Object.assign(unknownError, { status: 500 })
      const createStub = sandbox.stub().rejects(unknownError)
      const mockClient = createMockOpenAiClient(createStub)
      const provider = new OpenAiProvider(llmService, () => mockClient as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach here
          }
        },
        (err: Error) => {
          assert.ok(!(err instanceof LlmAuthError), 'Should not be LlmAuthError')
          assert.ok(!(err instanceof LlmRateLimitError), 'Should not be LlmRateLimitError')
          assert.equal(err.message, 'Something unexpected')
          return true
        }
      )
    })
  })
})
