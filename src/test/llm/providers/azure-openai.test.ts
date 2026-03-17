import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmService } from '../../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions, LlmRateLimitError } from '../../../llm/types'
import { AzureOpenAiProvider, AzureIdentityModule } from '../../../llm/providers/azure-openai'
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
 * Creates a mock AzureOpenAI client with a stubbed chat.completions.create method.
 */
function createMockAzureClient(createStub: sinon.SinonStub) {
  return {
    chat: {
      completions: {
        create: createStub,
      },
    },
  }
}

describe('AzureOpenAiProvider', () => {
  let sandbox: sinon.SinonSandbox
  let llmService: LlmService
  let mockContext: vscode.ExtensionContext
  let cancellationTokenSource: vscode.CancellationTokenSource
  let getConfigStub: sinon.SinonStub

  const defaultMessages: LlmMessage[] = [{ role: 'user', content: 'Hello' }]
  const defaultOptions: LlmOptions = {}

  /**
   * Stubs vscode.workspace.getConfiguration to return Azure config values.
   */
  function stubAzureConfig(overrides: Record<string, unknown> = {}) {
    const defaults: Record<string, unknown> = {
      azureEndpoint: 'https://my-resource.openai.azure.com/',
      azureDeployment: 'gpt-4o-deploy',
      azureAuthMethod: 'api-key',
      azureApiVersion: '2024-12-01-preview',
      ...overrides,
    }
    getConfigStub.returns({
      get: (key: string) => defaults[key],
      update: () => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration)
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockContext = createMockExtensionContext() as unknown as vscode.ExtensionContext
    llmService = new LlmService(mockContext)
    cancellationTokenSource = new vscode.CancellationTokenSource()
    getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration')
    stubAzureConfig()
  })

  afterEach(() => {
    sandbox.restore()
    cancellationTokenSource.dispose()
  })

  describe('provider id', () => {
    it('has id "azure-openai"', () => {
      const provider = new AzureOpenAiProvider(llmService)
      assert.equal(provider.id, 'azure-openai')
    })
  })

  describe('sendMessage - streaming', () => {
    it('creates chat completion stream and yields delta content chunks', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'Hello' },
          { content: ' world' },
          { content: '!' },
        ])
      )
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['Hello', ' world', '!'])
      assert.equal(createStub.callCount, 1)
      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.stream, true)
      assert.deepEqual(callArgs.messages, [{ role: 'user', content: 'Hello' }])
    })

    it('skips chunks with null or undefined delta content', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'A' },
          { content: null },
          { content: undefined },
          { content: 'B' },
        ])
      )
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['A', 'B'])
    })
  })

  describe('authentication errors', () => {
    it('throws LlmAuthError when API key is missing from SecretStorage', async () => {
      // Do not set any API key
      const createStub = sandbox.stub()
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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
          assert.equal((err as LlmAuthError).provider, 'azure-openai')
          return true
        }
      )

      // Verify Azure client was never called
      assert.equal(createStub.callCount, 0)
    })

    it('throws LlmAuthError when Azure returns 401', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-invalid-key')
      const apiError = new Error('Incorrect API key provided')
      Object.assign(apiError, { status: 401 })
      const createStub = sandbox.stub().rejects(apiError)
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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
          assert.equal((err as LlmAuthError).provider, 'azure-openai')
          return true
        }
      )
    })
  })

  describe('rate limit errors', () => {
    it('throws LlmRateLimitError with retryAfterMs when Azure returns 429', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const rateLimitError = new Error('Rate limit exceeded')
      Object.assign(rateLimitError, {
        status: 429,
        headers: { 'retry-after': '5' },
      })
      const createStub = sandbox.stub().rejects(rateLimitError)
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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
          assert.equal((err as LlmRateLimitError).retryAfterMs, 5000)
          return true
        }
      )
    })
  })

  describe('configuration validation', () => {
    it('throws LlmAuthError when Azure endpoint is missing', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      stubAzureConfig({ azureEndpoint: '' })
      const createStub = sandbox.stub()
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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
          assert.equal((err as LlmAuthError).provider, 'azure-openai')
          assert.ok(err.message.toLowerCase().includes('endpoint'), `Expected message about endpoint, got: ${err.message}`)
          return true
        }
      )

      assert.equal(createStub.callCount, 0)
    })

    it('throws LlmAuthError when Azure deployment is missing', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      stubAzureConfig({ azureDeployment: '' })
      const createStub = sandbox.stub()
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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
          assert.equal((err as LlmAuthError).provider, 'azure-openai')
          assert.ok(err.message.toLowerCase().includes('deployment'), `Expected message about deployment, got: ${err.message}`)
          return true
        }
      )

      assert.equal(createStub.callCount, 0)
    })
  })

  describe('reasoningEffort', () => {
    it('passes reasoning_effort to request params when set in options', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

      const options: LlmOptions = { reasoningEffort: 'medium' }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(
        (callArgs as Record<string, unknown>).reasoning_effort,
        'medium'
      )
    })
  })

  describe('apiVersion', () => {
    it('reads azureApiVersion from configuration', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      stubAzureConfig({ azureApiVersion: '2025-01-01-preview' })

      let capturedOpts: Record<string, unknown> | undefined
      const clientFactory = (opts: Record<string, unknown>) => {
        capturedOpts = opts
        const createStub = sinon.stub().resolves(
          createMockStream([{ content: 'ok' }])
        )
        return createMockAzureClient(createStub) as never
      }

      const provider = new AzureOpenAiProvider(llmService, clientFactory as never)
      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.ok(capturedOpts, 'Client factory should have been called')
      assert.equal(capturedOpts!.apiVersion, '2025-01-01-preview')
    })
  })

  describe('edge cases', () => {
    it('handles empty stream with no chunks', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const emptyStream = {
        async *[Symbol.asyncIterator]() {
          // yields nothing
        },
      }
      const createStub = sandbox.stub().resolves(emptyStream)
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, [])
    })

    it('passes maxTokens and temperature options', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

      const options: LlmOptions = { maxTokens: 500, temperature: 0.3 }
      await collectChunks(
        provider.sendMessage(defaultMessages, options, cancellationTokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.max_tokens, 500)
      assert.equal(callArgs.temperature, 0.3)
    })

    it('re-throws unknown errors without mapping', async () => {
      await llmService.setApiKey('azure-openai-api-key', 'az-test-key')
      const unknownError = new Error('Something unexpected')
      Object.assign(unknownError, { status: 500 })
      const createStub = sandbox.stub().rejects(unknownError)
      const mockClient = createMockAzureClient(createStub)
      const provider = new AzureOpenAiProvider(llmService, () => mockClient as never)

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

  describe('managed identity', () => {
    function createCredentialUnavailableError(message: string): Error {
      const err = new Error(message)
      err.name = 'CredentialUnavailableError'
      return err
    }

    function createMockIdentityModule(overrides?: {
      defaultGetToken?: sinon.SinonStub
      browserGetToken?: sinon.SinonStub
    }): AzureIdentityModule {
      return {
        DefaultAzureCredential: class {
          async getToken(scope: string) {
            if (overrides?.defaultGetToken) {
              return overrides.defaultGetToken(scope)
            }
            return { token: 'default-token-123' }
          }
        } as unknown as AzureIdentityModule['DefaultAzureCredential'],
        InteractiveBrowserCredential: class {
          async getToken(scope: string) {
            if (overrides?.browserGetToken) {
              return overrides.browserGetToken(scope)
            }
            return { token: 'browser-token-456' }
          }
        } as unknown as AzureIdentityModule['InteractiveBrowserCredential'],
      }
    }

    beforeEach(() => {
      stubAzureConfig({ azureAuthMethod: 'managed-identity' })
    })

    it('does not read API key when auth method is managed-identity', async () => {
      const createStub = sandbox.stub().resolves(createMockStream([{ content: 'hi' }]))
      const identityModule = createMockIdentityModule()
      const apiKeyStub = sandbox.stub(llmService, 'getApiKey').resolves('test-key')

      const provider = new AzureOpenAiProvider(
        llmService,
        () => createMockAzureClient(createStub) as never,
        async () => identityModule
      )

      await collectChunks(provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token))
      assert.ok(apiKeyStub.notCalled, 'Should not read API key for managed identity')
    })

    it('uses azureADTokenProvider callback instead of apiKey', async () => {
      const createStub = sandbox.stub().resolves(createMockStream([{ content: 'ok' }]))
      let capturedOpts: Record<string, unknown> = {}
      const identityModule = createMockIdentityModule()

      const provider = new AzureOpenAiProvider(
        llmService,
        (opts) => { capturedOpts = { ...opts }; return createMockAzureClient(createStub) as never },
        async () => identityModule
      )

      await collectChunks(provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token))
      assert.ok(capturedOpts.azureADTokenProvider, 'Should pass azureADTokenProvider')
      assert.equal(capturedOpts.apiKey, undefined, 'Should not pass apiKey')
    })

    it('calls DefaultAzureCredential.getToken with correct scope', async () => {
      const getTokenStub = sandbox.stub().resolves({ token: 'test-token' })
      const createStub = sandbox.stub().resolves(createMockStream([{ content: 'ok' }]))
      const identityModule = createMockIdentityModule({ defaultGetToken: getTokenStub })

      const provider = new AzureOpenAiProvider(
        llmService,
        () => createMockAzureClient(createStub) as never,
        async () => identityModule
      )

      await collectChunks(provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token))
      assert.ok(getTokenStub.calledWith('https://cognitiveservices.azure.com/.default'))
    })

    it('falls back to InteractiveBrowserCredential on CredentialUnavailableError', async () => {
      const defaultGetToken = sandbox.stub().rejects(createCredentialUnavailableError('No credential'))
      const browserGetToken = sandbox.stub().resolves({ token: 'browser-token' })
      const createStub = sandbox.stub().resolves(createMockStream([{ content: 'ok' }]))
      const identityModule = createMockIdentityModule({ defaultGetToken, browserGetToken })

      const provider = new AzureOpenAiProvider(
        llmService,
        () => createMockAzureClient(createStub) as never,
        async () => identityModule
      )

      await collectChunks(provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token))
      assert.ok(defaultGetToken.called, 'Should try DefaultAzureCredential first')
      assert.ok(browserGetToken.called, 'Should fall back to InteractiveBrowserCredential')
    })

    it('throws LlmAuthError when both credentials fail', async () => {
      const defaultGetToken = sandbox.stub().rejects(createCredentialUnavailableError('No default'))
      const browserGetToken = sandbox.stub().rejects(new Error('Browser failed'))
      const createStub = sandbox.stub().resolves(createMockStream([]))
      const identityModule = createMockIdentityModule({ defaultGetToken, browserGetToken })

      const provider = new AzureOpenAiProvider(
        llmService,
        () => createMockAzureClient(createStub) as never,
        async () => identityModule
      )

      await assert.rejects(
        async () => {
          for await (const _chunk of provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)) {
            // should not reach
          }
        },
        (err: Error) => {
          assert.ok(err instanceof LlmAuthError)
          assert.ok(err.message.includes('az login'))
          return true
        }
      )
    })

    it('streaming works same after token obtained via managed identity', async () => {
      const createStub = sandbox.stub().resolves(createMockStream([
        { content: 'Hello' },
        { content: ' World' },
      ]))
      const identityModule = createMockIdentityModule()

      const provider = new AzureOpenAiProvider(
        llmService,
        () => createMockAzureClient(createStub) as never,
        async () => identityModule
      )

      const chunks = await collectChunks(provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token))
      assert.deepStrictEqual(chunks, ['Hello', ' World'])
    })
  })
})
