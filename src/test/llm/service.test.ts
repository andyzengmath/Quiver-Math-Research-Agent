import { strict as assert } from 'assert'
import * as vscode from 'vscode'
import { LlmService } from '../../llm/service'
import { LlmAuthError, LlmMessage, LlmOptions, LlmProvider } from '../../llm/types'
import { createMockExtensionContext } from '../mock-vscode'

/**
 * Creates a mock LlmProvider that yields predefined chunks.
 */
function createMockProvider(id: string, chunks: string[] = ['hello', ' world']): LlmProvider {
  return {
    id,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async *sendMessage(_messages: LlmMessage[], _options: LlmOptions, _token: vscode.CancellationToken): AsyncIterable<string> {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

/**
 * Helper to collect all chunks from an AsyncIterable into a single string.
 */
async function collectChunks(iterable: AsyncIterable<string>): Promise<string> {
  let result = ''
  for await (const chunk of iterable) {
    result += chunk
  }
  return result
}

describe('LlmService', () => {
  let service: LlmService
  let mockContext: vscode.ExtensionContext

  beforeEach(() => {
    mockContext = createMockExtensionContext() as unknown as vscode.ExtensionContext
    service = new LlmService(mockContext)
  })

  describe('registerProvider and getProvider', () => {
    it('getProvider returns the registered provider by id', () => {
      const provider = createMockProvider('openai')
      service.registerProvider(provider)
      const result = service.getProvider('openai')
      assert.equal(result.id, 'openai')
    })

    it('getProvider throws Error for unknown provider id', () => {
      assert.throws(
        () => service.getProvider('unknown'),
        (err: Error) => err.message.includes('unknown')
      )
    })

    it('getProvider throws LlmAuthError when no provider is configured and no id given', () => {
      assert.throws(
        () => service.getProvider(),
        (err: Error) => err instanceof LlmAuthError
      )
    })
  })

  describe('setProvider', () => {
    it('switches the active provider', () => {
      const openai = createMockProvider('openai', ['openai-chunk'])
      const anthropic = createMockProvider('anthropic', ['anthropic-chunk'])
      service.registerProvider(openai)
      service.registerProvider(anthropic)

      service.setProvider('openai')
      assert.equal(service.getProvider().id, 'openai')

      service.setProvider('anthropic')
      assert.equal(service.getProvider().id, 'anthropic')
    })

    it('throws when setting an unregistered provider', () => {
      assert.throws(
        () => service.setProvider('nonexistent'),
        (err: Error) => err.message.includes('nonexistent')
      )
    })
  })

  describe('sendMessage', () => {
    it('delegates to the active provider and streams chunks', async () => {
      const provider = createMockProvider('openai', ['chunk1', 'chunk2', 'chunk3'])
      service.registerProvider(provider)
      service.setProvider('openai')

      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]
      const options: LlmOptions = {}
      const tokenSource = new vscode.CancellationTokenSource()

      const result = await collectChunks(
        service.sendMessage(messages, options, tokenSource.token)
      )

      assert.equal(result, 'chunk1chunk2chunk3')
      tokenSource.dispose()
    })

    it('throws LlmAuthError when no provider is configured', async () => {
      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]
      const options: LlmOptions = {}
      const tokenSource = new vscode.CancellationTokenSource()

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of service.sendMessage(messages, options, tokenSource.token)) {
            // should not reach here
          }
        },
        (err: Error) => err instanceof LlmAuthError
      )
      tokenSource.dispose()
    })
  })

  describe('edge cases', () => {
    it('registering a provider with the same id overwrites the previous one', () => {
      const provider1 = createMockProvider('openai', ['v1'])
      const provider2 = createMockProvider('openai', ['v2'])
      service.registerProvider(provider1)
      service.registerProvider(provider2)

      // Should get the latest registration
      const result = service.getProvider('openai')
      assert.equal(result.id, 'openai')
    })

    it('sendMessage yields empty result for provider that yields no chunks', async () => {
      const provider = createMockProvider('openai', [])
      service.registerProvider(provider)
      service.setProvider('openai')

      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]
      const tokenSource = new vscode.CancellationTokenSource()
      const result = await collectChunks(
        service.sendMessage(messages, {}, tokenSource.token)
      )

      assert.equal(result, '')
      tokenSource.dispose()
    })

    it('getApiKey returns undefined for unset key', async () => {
      const key = await service.getApiKey('nonexistent-key')
      assert.equal(key, undefined)
    })

    it('setApiKey and getApiKey roundtrip works', async () => {
      await service.setApiKey('openai-key', 'sk-test-123')
      const key = await service.getApiKey('openai-key')
      assert.equal(key, 'sk-test-123')
    })
  })
})
