import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmAuthError, LlmRateLimitError, LlmMessage, LlmOptions } from '../../../llm/types'
import { AnthropicProvider } from '../../../llm/providers/anthropic'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Helper to collect all chunks from an AsyncIterable into a string array.
 */
async function collectChunks(iterable: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of iterable) {
    chunks.push(chunk)
  }
  return chunks
}

/**
 * Creates a fake Anthropic stream that yields text delta events.
 */
function createFakeStream(textDeltas: string[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of textDeltas) {
        yield {
          type: 'content_block_delta' as const,
          index: 0,
          delta: { type: 'text_delta' as const, text },
        } as Anthropic.ContentBlockDeltaEvent
      }
      yield {
        type: 'message_stop' as const,
      } as Anthropic.MessageStopEvent
    },
  }
}

describe('AnthropicProvider', () => {
  let sandbox: sinon.SinonSandbox
  let getApiKey: sinon.SinonStub
  let tokenSource: vscode.CancellationTokenSource

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    getApiKey = sandbox.stub()
    tokenSource = new vscode.CancellationTokenSource()
  })

  afterEach(() => {
    sandbox.restore()
    tokenSource.dispose()
  })

  describe('id', () => {
    it('returns "anthropic"', () => {
      const provider = new AnthropicProvider(getApiKey)
      assert.equal(provider.id, 'anthropic')
    })
  })

  describe('sendMessage', () => {
    it('creates message stream and yields text delta chunks', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['Hello', ' World', '!'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Hi there' },
      ]
      const options: LlmOptions = { model: 'claude-opus-4-6', maxTokens: 1024 }

      const chunks = await collectChunks(
        provider.sendMessage(messages, options, tokenSource.token)
      )

      assert.deepEqual(chunks, ['Hello', ' World', '!'])
      assert.ok(createStub.calledOnce)

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.model, 'claude-opus-4-6')
      assert.equal(callArgs.max_tokens, 1024)
      assert.equal(callArgs.stream, true)
    })

    it('throws LlmAuthError with "anthropic" when API key is missing', async () => {
      getApiKey.resolves(undefined)

      const provider = new AnthropicProvider(getApiKey)
      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmAuthError)
          assert.equal((err as LlmAuthError).provider, 'anthropic')
          return true
        }
      )
    })

    it('throws LlmAuthError when Anthropic returns 401', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const headers = new Map([['request-id', 'test-req']])
      const authError = new Anthropic.AuthenticationError(
        401,
        { type: 'error', error: { type: 'authentication_error', message: 'invalid api key' } },
        'invalid api key',
        headers as unknown as Headers
      )

      const createStub = sandbox.stub().rejects(authError)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmAuthError)
          assert.equal((err as LlmAuthError).provider, 'anthropic')
          return true
        }
      )
    })

    it('throws LlmRateLimitError when Anthropic returns 429', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const headers = new Map([['request-id', 'test-req'], ['retry-after', '30']])
      const rateLimitError = new Anthropic.RateLimitError(
        429,
        { type: 'error', error: { type: 'rate_limit_error', message: 'rate limited' } },
        'rate limited',
        headers as unknown as Headers
      )

      const createStub = sandbox.stub().rejects(rateLimitError)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const messages: LlmMessage[] = [{ role: 'user', content: 'test' }]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmRateLimitError)
          return true
        }
      )
    })

    it('passes system messages as the "system" parameter, not in messages array', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['response'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant' },
        { role: 'user', content: 'What is 2+2?' },
      ]

      const chunks = await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      assert.deepEqual(chunks, ['response'])
      assert.ok(createStub.calledOnce)

      const callArgs = createStub.firstCall.args[0]
      // System message should be extracted to the system parameter
      assert.equal(callArgs.system, 'You are a math assistant')
      // Messages array should only contain non-system messages
      assert.deepEqual(callArgs.messages, [
        { role: 'user', content: 'What is 2+2?' },
      ])
    })
  })

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['ok'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const chunks = await collectChunks(
        provider.sendMessage([], {}, tokenSource.token)
      )

      assert.deepEqual(chunks, ['ok'])
      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.system, undefined)
      assert.deepEqual(callArgs.messages, [])
    })

    it('handles multiple system messages by concatenating them', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['ok'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math assistant.' },
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Hi' },
      ]

      await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.system, 'You are a math assistant.\nBe precise.')
      assert.deepEqual(callArgs.messages, [
        { role: 'user', content: 'Hi' },
      ])
    })

    it('uses default model when none specified in options', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['ok'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      await collectChunks(
        provider.sendMessage(
          [{ role: 'user', content: 'test' }],
          {},
          tokenSource.token
        )
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.model, 'claude-sonnet-4-20250514')
    })

    it('uses default maxTokens when none specified', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['ok'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      await collectChunks(
        provider.sendMessage(
          [{ role: 'user', content: 'test' }],
          {},
          tokenSource.token
        )
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.max_tokens, 4096)
    })

    it('yields no chunks when stream has no content_block_delta events', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const emptyStream: AsyncIterable<Anthropic.MessageStreamEvent> = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message_start' as const } as unknown as Anthropic.MessageStreamEvent
          yield { type: 'message_stop' as const } as Anthropic.MessageStopEvent
        },
      }

      const createStub = sandbox.stub().resolves(emptyStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      const chunks = await collectChunks(
        provider.sendMessage(
          [{ role: 'user', content: 'test' }],
          {},
          tokenSource.token
        )
      )

      assert.deepEqual(chunks, [])
    })

    it('rethrows unknown errors unchanged', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const unexpectedError = new Error('network failure')
      const createStub = sandbox.stub().rejects(unexpectedError)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(
            [{ role: 'user', content: 'test' }],
            {},
            tokenSource.token
          )) {
            // should not reach
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof Error)
          assert.equal((err as Error).message, 'network failure')
          assert.ok(!(err instanceof LlmAuthError))
          assert.ok(!(err instanceof LlmRateLimitError))
          return true
        }
      )
    })

    it('passes temperature when specified', async () => {
      getApiKey.resolves('sk-ant-test-key')

      const fakeStream = createFakeStream(['ok'])
      const createStub = sandbox.stub().resolves(fakeStream)

      const provider = new AnthropicProvider(getApiKey, () => ({
        messages: { create: createStub },
      } as unknown as Anthropic))

      await collectChunks(
        provider.sendMessage(
          [{ role: 'user', content: 'test' }],
          { temperature: 0.7 },
          tokenSource.token
        )
      )

      const callArgs = createStub.firstCall.args[0]
      assert.equal(callArgs.temperature, 0.7)
    })
  })
})
