import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmService } from '../../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions } from '../../../llm/types'
import {
  AzureOpenAiProvider,
  AzureIdentityModule,
  AzureIdentityImporter,
} from '../../../llm/providers/azure-openai'
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
 * Creates a mock AzureOpenAI client with stubbed chat.completions.create.
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

/**
 * Creates a CredentialUnavailableError (same shape as @azure/identity throws).
 */
function createCredentialUnavailableError(message: string): Error {
  const err = new Error(message)
  err.name = 'CredentialUnavailableError'
  return err
}

/**
 * Creates a mock @azure/identity module for testing managed identity flows.
 */
function createMockIdentityModule(opts: {
  defaultGetToken?: sinon.SinonStub
  browserGetToken?: sinon.SinonStub
}): AzureIdentityModule {
  return {
    DefaultAzureCredential: class {
      getToken = opts.defaultGetToken ?? sinon.stub().resolves({ token: 'default-token' })
    } as unknown as AzureIdentityModule['DefaultAzureCredential'],
    InteractiveBrowserCredential: class {
      getToken = opts.browserGetToken ?? sinon.stub().resolves({ token: 'browser-token' })
    } as unknown as AzureIdentityModule['InteractiveBrowserCredential'],
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

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockContext = createMockExtensionContext() as unknown as vscode.ExtensionContext
    llmService = new LlmService(mockContext)
    cancellationTokenSource = new vscode.CancellationTokenSource()
  })

  afterEach(() => {
    sandbox.restore()
    if (getConfigStub) {
      getConfigStub.restore()
    }
    cancellationTokenSource.dispose()
  })

  function stubConfig(values: Record<string, unknown>): void {
    getConfigStub = sandbox.stub(vscode.workspace, 'getConfiguration').returns({
      get: (key: string) => values[key],
      update: () => Promise.resolve(),
    } as unknown as vscode.WorkspaceConfiguration)
  }

  describe('api-key auth', () => {
    it('creates client with API key and streams response', async () => {
      await llmService.setApiKey('azure-openai', 'test-azure-key')
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'api-key',
      })

      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'Hello' },
          { content: ' from Azure' },
        ])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['Hello', ' from Azure'])
      assert.equal(clientFactoryStub.callCount, 1)
      const factoryArgs = clientFactoryStub.firstCall.args[0]
      assert.equal(factoryArgs.apiKey, 'test-azure-key')
      assert.equal(factoryArgs.endpoint, 'https://my-resource.openai.azure.com')
    })

    it('throws LlmAuthError when API key is missing', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureAuthMethod: 'api-key',
      })

      const createStub = sandbox.stub()
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub)

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

    it('throws LlmAuthError when endpoint is not configured', async () => {
      await llmService.setApiKey('azure-openai', 'test-key')
      stubConfig({
        azureEndpoint: undefined,
        azureAuthMethod: 'api-key',
      })

      const createStub = sandbox.stub()
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub)

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
          assert.ok(err.message.includes('endpoint'), `Expected endpoint message, got: ${err.message}`)
          return true
        }
      )
    })
  })

  describe('managed identity', () => {
    it('does not read API key when auth method is managed-identity', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const getApiKeySpy = sandbox.spy(llmService, 'getApiKey')

      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({})
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.equal(getApiKeySpy.callCount, 0, 'getApiKey should not be called for managed-identity auth')
    })

    it('uses azureADTokenProvider callback instead of apiKey', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'token-response' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({})
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.equal(clientFactoryStub.callCount, 1)
      const factoryArgs = clientFactoryStub.firstCall.args[0]
      assert.equal(factoryArgs.apiKey, undefined, 'apiKey should not be set for managed-identity')
      assert.ok(typeof factoryArgs.azureADTokenProvider === 'function', 'azureADTokenProvider should be a function')
    })

    it('calls DefaultAzureCredential.getToken with correct scope', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const defaultGetToken = sinon.stub().resolves({ token: 'test-token-123' })
      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'ok' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({ defaultGetToken })
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

      await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.ok(defaultGetToken.called, 'DefaultAzureCredential.getToken should have been called')
      const scope = defaultGetToken.firstCall.args[0]
      assert.equal(scope, 'https://cognitiveservices.azure.com/.default',
        'Token scope should be https://cognitiveservices.azure.com/.default')
    })

    it('falls back to InteractiveBrowserCredential on CredentialUnavailableError', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const defaultGetToken = sinon.stub().rejects(
        createCredentialUnavailableError('No credential available')
      )
      const browserGetToken = sinon.stub().resolves({ token: 'browser-fallback-token' })

      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'browser-ok' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({ defaultGetToken, browserGetToken })
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['browser-ok'])
      assert.ok(defaultGetToken.called, 'DefaultAzureCredential.getToken should have been attempted')
      assert.ok(browserGetToken.called, 'InteractiveBrowserCredential.getToken should have been called as fallback')
    })

    it('throws LlmAuthError when both credentials fail', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const defaultGetToken = sinon.stub().rejects(
        createCredentialUnavailableError('No credential available')
      )
      const browserGetToken = sinon.stub().rejects(
        new Error('Browser auth also failed')
      )

      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'should-not-reach' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({ defaultGetToken, browserGetToken })
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

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
          assert.ok(err.message.includes('managed identity'), `Expected managed identity message, got: ${err.message}`)
          return true
        }
      )
    })

    it('streaming works same after token obtained via managed identity', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const createStub = sandbox.stub().resolves(
        createMockStream([
          { content: 'chunk1' },
          { content: null },
          { content: 'chunk2' },
          { content: undefined },
          { content: 'chunk3' },
        ])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({})
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

      const chunks = await collectChunks(
        provider.sendMessage(defaultMessages, defaultOptions, cancellationTokenSource.token)
      )

      assert.deepEqual(chunks, ['chunk1', 'chunk2', 'chunk3'])
    })

    it('throws LlmAuthError when DefaultAzureCredential throws non-CredentialUnavailableError', async () => {
      stubConfig({
        azureEndpoint: 'https://my-resource.openai.azure.com',
        azureApiVersion: '2024-10-21',
        azureAuthMethod: 'managed-identity',
      })

      const defaultGetToken = sinon.stub().rejects(new Error('Network timeout'))
      const browserGetToken = sinon.stub().resolves({ token: 'should-not-be-used' })

      const createStub = sandbox.stub().resolves(
        createMockStream([{ content: 'should-not-reach' }])
      )
      const clientFactoryStub = sandbox.stub().returns(createMockAzureClient(createStub))

      const mockIdentity = createMockIdentityModule({ defaultGetToken, browserGetToken })
      const identityImporter: AzureIdentityImporter = () => Promise.resolve(mockIdentity)
      const provider = new AzureOpenAiProvider(llmService, clientFactoryStub, identityImporter)

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
          return true
        }
      )

      // InteractiveBrowserCredential should NOT have been called since it was a different error
      assert.equal(browserGetToken.callCount, 0,
        'InteractiveBrowserCredential should not be tried for non-CredentialUnavailableError')
    })
  })

  describe('provider id', () => {
    it('has id "azure-openai"', () => {
      const provider = new AzureOpenAiProvider(llmService)
      assert.equal(provider.id, 'azure-openai')
    })
  })
})
