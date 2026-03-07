import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmService } from '../../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions, LlmRateLimitError } from '../../../llm/types'
import { GoogleProvider } from '../../../llm/providers/google'
import { createMockExtensionContext } from '../../mock-vscode'
import {
  GoogleGenerativeAI,
  GenerativeModel,
  GoogleGenerativeAIFetchError,
} from '@google/generative-ai'

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
 * Creates a mock stream result that yields EnhancedGenerateContentResponse chunks.
 */
function createMockStreamResult(textChunks: string[]) {
  async function* streamGenerator() {
    for (const text of textChunks) {
      yield {
        text: () => text,
        candidates: [{ content: { parts: [{ text }], role: 'model' } }],
        functionCalls: () => [],
        functionCall: () => undefined,
      }
    }
  }

  return {
    stream: streamGenerator(),
    response: Promise.resolve({
      text: () => textChunks.join(''),
      candidates: [],
      functionCalls: () => [],
      functionCall: () => undefined,
    }),
  }
}

/**
 * Creates a mock GoogleGenerativeAI instance with a stubbed getGenerativeModel method.
 */
function createMockGoogleAI(generateContentStreamStub: sinon.SinonStub, capturedParams?: { modelParams?: unknown }) {
  const mockModel = {
    generateContentStream: generateContentStreamStub,
  }

  return {
    getGenerativeModel: (params: unknown) => {
      if (capturedParams) {
        capturedParams.modelParams = params
      }
      return mockModel as unknown as GenerativeModel
    },
  } as unknown as GoogleGenerativeAI
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
      await llmService.setApiKey('google', 'test-google-key')

      const streamResult = createMockStreamResult(['Hello', ' World', '!'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

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
      await llmService.setApiKey('google', 'invalid-key')

      const authError = new GoogleGenerativeAIFetchError(
        'API key not valid. Please pass a valid API key.',
        403,
        'Forbidden',
      )

      const generateStub = sandbox.stub().rejects(authError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI)

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
      await llmService.setApiKey('google', 'expired-key')

      const authError = new GoogleGenerativeAIFetchError(
        'Unauthorized',
        401,
        'Unauthorized',
      )

      const generateStub = sandbox.stub().rejects(authError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI)

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
      await llmService.setApiKey('google', 'test-key')

      const rateLimitError = new GoogleGenerativeAIFetchError(
        'Resource has been exhausted',
        429,
        'Too Many Requests',
      )

      const generateStub = sandbox.stub().rejects(rateLimitError)
      const mockAI = createMockGoogleAI(generateStub)
      const provider = new GoogleProvider(llmService, () => mockAI)

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
    it('sets system instruction from system messages', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['response'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const capturedParams: { modelParams?: unknown } = {}
      const mockAI = createMockGoogleAI(generateStub, capturedParams)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant' },
        { role: 'user', content: 'What is 2+2?' },
      ]

      const chunks = await collectChunks(
        provider.sendMessage(messages, {}, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['response'])

      // Verify system instruction was set on the model
      const params = capturedParams.modelParams as { systemInstruction?: string }
      assert.equal(params.systemInstruction, 'You are a math assistant')

      // Verify the generateContentStream was called without system messages
      const callArgs = generateStub.firstCall.args[0]
      const contents = Array.isArray(callArgs) ? callArgs : callArgs.contents ?? callArgs
      // Ensure no system role in the content passed to generateContentStream
      if (Array.isArray(contents)) {
        for (const content of contents) {
          if (typeof content === 'object' && 'role' in content) {
            assert.notEqual(content.role, 'system', 'System messages should not be in contents')
          }
        }
      }
    })

    it('concatenates multiple system messages into one instruction', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['ok'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const capturedParams: { modelParams?: unknown } = {}
      const mockAI = createMockGoogleAI(generateStub, capturedParams)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant.' },
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Hi' },
      ]

      await collectChunks(
        provider.sendMessage(messages, {}, cancellationTokenSource.token)
      )

      const params = capturedParams.modelParams as { systemInstruction?: string }
      assert.equal(params.systemInstruction, 'You are a math assistant.\nBe precise.')
    })
  })

  describe('model configuration', () => {
    it('uses model from options when provided', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['ok'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const capturedParams: { modelParams?: unknown } = {}
      const mockAI = createMockGoogleAI(generateStub, capturedParams)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const options: LlmOptions = { model: 'gemini-2.0-flash' }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const params = capturedParams.modelParams as { model?: string }
      assert.equal(params.model, 'gemini-2.0-flash')
    })

    it('uses default model when none specified in options', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['ok'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const capturedParams: { modelParams?: unknown } = {}
      const mockAI = createMockGoogleAI(generateStub, capturedParams)

      const provider = new GoogleProvider(llmService, () => mockAI)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      const params = capturedParams.modelParams as { model?: string }
      assert.ok(
        typeof params.model === 'string' && params.model.length > 0,
        `Expected a non-empty model string, got "${params.model}"`
      )
    })
  })

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['ok'])
      const generateStub = sandbox.stub().resolves(streamResult)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const chunks = await collectChunks(
        provider.sendMessage([], {}, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['ok'])
    })

    it('handles empty stream with no chunks', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult([])
      const generateStub = sandbox.stub().resolves(streamResult)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, [])
    })

    it('rethrows unknown errors unchanged', async () => {
      await llmService.setApiKey('google', 'test-key')

      const unknownError = new Error('network failure')
      const generateStub = sandbox.stub().rejects(unknownError)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

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

    it('handles chunks where text() returns empty string', async () => {
      await llmService.setApiKey('google', 'test-key')

      const streamResult = createMockStreamResult(['', 'data', ''])
      const generateStub = sandbox.stub().resolves(streamResult)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      // Empty strings are valid, they should be yielded
      assert.deepEqual(chunks, ['', 'data', ''])
    })

    it('maps GoogleGenerativeAIFetchError with 500 as unknown error (rethrows)', async () => {
      await llmService.setApiKey('google', 'test-key')

      const serverError = new GoogleGenerativeAIFetchError(
        'Internal server error',
        500,
        'Internal Server Error',
      )

      const generateStub = sandbox.stub().rejects(serverError)
      const mockAI = createMockGoogleAI(generateStub)

      const provider = new GoogleProvider(llmService, () => mockAI)

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
