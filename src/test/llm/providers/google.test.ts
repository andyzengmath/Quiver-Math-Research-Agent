import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmService } from '../../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions, LlmRateLimitError } from '../../../llm/types'
import { GoogleProvider } from '../../../llm/providers/google'
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
 * Creates a mock async iterable stream that yields chunks with a `.text` property.
 * This matches the @google/genai SDK response shape.
 */
function createMockStream(textChunks: string[]) {
  async function* streamGenerator() {
    for (const text of textChunks) {
      yield { text }
    }
  }
  return streamGenerator()
}

/**
 * Creates a mock GoogleGenAI client with a stubbed models.generateContentStream method.
 * The new SDK uses client.models.generateContentStream({ model, contents, config }).
 */
function createMockGoogleAI(generateContentStreamStub: sinon.SinonStub) {
  return {
    models: {
      generateContentStream: generateContentStreamStub,
    },
  }
}

describe('GoogleProvider', () => {
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

  describe('id', () => {
    it('has id "google"', () => {
      const provider = new GoogleProvider(llmService)
      assert.equal(provider.id, 'google')
    })
  })

  describe('sendMessage - streaming', () => {
    it('calls generateContentStream and yields text chunks', async () => {
      await llmService.setApiKey('google-api-key', 'test-google-key')

      const mockStream = createMockStream(['Hello', ' World', '!'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['Hello', ' World', '!'])
      assert.ok(generateStub.calledOnce)
    })
  })

  describe('authentication errors', () => {
    it('throws LlmAuthError with "google" when API key is missing', async () => {
      // Do not set any API key
      const provider = new GoogleProvider(llmService)

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
          assert.equal((err as LlmAuthError).provider, 'google')
          return true
        }
      )
    })

    it('throws LlmAuthError when Google returns auth error (403)', async () => {
      await llmService.setApiKey('google-api-key', 'invalid-key')

      const authError = Object.assign(
        new Error('API key not valid. Please pass a valid API key.'),
        { status: 403 }
      )

      const generateStub = sandbox.stub().rejects(authError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI as never)

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
          assert.equal((err as LlmAuthError).provider, 'google')
          return true
        }
      )
    })

    it('throws LlmAuthError when Google returns 401', async () => {
      await llmService.setApiKey('google-api-key', 'expired-key')

      const authError = Object.assign(
        new Error('Unauthorized'),
        { status: 401 }
      )

      const generateStub = sandbox.stub().rejects(authError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI as never)

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
          assert.equal((err as LlmAuthError).provider, 'google')
          return true
        }
      )
    })
  })

  describe('rate limit errors', () => {
    it('throws LlmRateLimitError when Google returns 429', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const rateLimitError = Object.assign(
        new Error('Resource has been exhausted'),
        { status: 429 }
      )

      const generateStub = sandbox.stub().rejects(rateLimitError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI as never)

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
          return true
        }
      )
    })
  })

  describe('system instruction', () => {
    it('sets system instruction in config from system messages', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['response'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant' },
        { role: 'user', content: 'What is 2+2?' },
      ]

      const chunks = await collectChunks(
        provider.sendMessage(messages, {}, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['response'])

      // Verify the generateContentStream call args
      const callArgs = generateStub.firstCall.args[0]
      // System instruction should be in config
      assert.equal(callArgs.config.systemInstruction, 'You are a math assistant')

      // Verify system messages are not in contents
      const contents = callArgs.contents as Array<{ role: string }>
      for (const content of contents) {
        assert.notEqual(content.role, 'system', 'System messages should not be in contents')
      }
    })

    it('concatenates multiple system messages into one instruction', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['ok'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant.' },
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Hi' },
      ]

      await collectChunks(
        provider.sendMessage(messages, {}, cancellationTokenSource.token)
      )

      const callArgs = generateStub.firstCall.args[0]
      assert.equal(callArgs.config.systemInstruction, 'You are a math assistant.\nBe precise.')
    })
  })

  describe('model configuration', () => {
    it('uses model from options when provided', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['ok'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const options: LlmOptions = { model: 'gemini-2.0-flash' }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const callArgs = generateStub.firstCall.args[0]
      assert.equal(callArgs.model, 'gemini-2.0-flash')
    })

    it('uses default model when none specified in options', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['ok'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      const callArgs = generateStub.firstCall.args[0]
      assert.equal(callArgs.model, 'gemini-3.1-pro-preview')
    })
  })

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['ok'])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const chunks = await collectChunks(
        provider.sendMessage([], {}, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['ok'])
    })

    it('handles empty stream with no chunks', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream([])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, [])
    })

    it('rethrows unknown errors unchanged', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const unknownError = new Error('network failure')
      const generateStub = sandbox.stub().rejects(unknownError)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach
          }
        },
        (err: Error) => {
          assert.ok(!(err instanceof LlmAuthError), 'Should not be LlmAuthError')
          assert.ok(!(err instanceof LlmRateLimitError), 'Should not be LlmRateLimitError')
          assert.equal(err.message, 'network failure')
          return true
        }
      )
    })

    it('skips chunks where text is empty string', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const mockStream = createMockStream(['', 'data', ''])
      const generateStub = sandbox.stub().resolves(mockStream)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      // The provider checks `if (text)` which is falsy for empty strings, so they are skipped
      assert.deepEqual(chunks, ['data'])
    })

    it('rethrows error with status 500 unchanged', async () => {
      await llmService.setApiKey('google-api-key', 'test-key')

      const serverError = Object.assign(
        new Error('Internal server error'),
        { status: 500 }
      )

      const generateStub = sandbox.stub().rejects(serverError)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI as never)

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            defaultMessages,
            defaultOptions,
            cancellationTokenSource.token
          )) {
            // should not reach
          }
        },
        (err: Error) => {
          assert.ok(!(err instanceof LlmAuthError), 'Should not be LlmAuthError')
          assert.ok(!(err instanceof LlmRateLimitError), 'Should not be LlmRateLimitError')
          return true
        }
      )
    })
  })
})
