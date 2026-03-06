import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { LlmAuthError, LlmMessage, LlmRateLimitError } from '../../../llm/types'
import { VscodeLmProvider } from '../../../llm/providers/vscode-lm'

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

/**
 * Creates an async iterable from an array of strings,
 * mimicking the vscode LanguageModelChatResponse.text property.
 */
function createAsyncIterable(chunks: string[]): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          if (index < chunks.length) {
            return { value: chunks[index++], done: false }
          }
          return { value: undefined as unknown as string, done: true }
        },
      }
    },
  }
}

describe('VscodeLmProvider', () => {
  let provider: VscodeLmProvider
  let selectChatModelsStub: sinon.SinonStub
  let tokenSource: vscode.CancellationTokenSource

  beforeEach(() => {
    provider = new VscodeLmProvider()
    tokenSource = new vscode.CancellationTokenSource()
    // Stub vscode.lm.selectChatModels
    selectChatModelsStub = sinon.stub(vscode.lm, 'selectChatModels')
  })

  afterEach(() => {
    sinon.restore()
    tokenSource.dispose()
  })

  it('has id "vscode-lm"', () => {
    assert.equal(provider.id, 'vscode-lm')
  })

  describe('sendMessage', () => {
    it('calls selectChatModels and sendRequest, yields chunks from response.text', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable(['Hello', ' ', 'world']),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'What is 2+2?' },
      ]

      const result = await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      assert.equal(result, 'Hello world')
      assert.ok(selectChatModelsStub.calledOnce, 'selectChatModels should be called once')
      assert.ok(mockSendRequest.calledOnce, 'sendRequest should be called once')
      // Verify sendRequest was called with the cancellation token
      assert.equal(mockSendRequest.firstCall.args[2], tokenSource.token)
    })

    it('builds correct LanguageModelChatMessage array from input messages', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable(['ok']),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        { role: 'user', content: 'How are you?' },
      ]

      await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      // Verify the first argument to sendRequest is an array of LanguageModelChatMessage
      const chatMessages = mockSendRequest.firstCall.args[0]
      assert.equal(chatMessages.length, 3)
      assert.equal(chatMessages[0].content, 'Hello')
      assert.equal(chatMessages[1].content, 'Hi there')
      assert.equal(chatMessages[2].content, 'How are you?')
    })

    it('throws LlmAuthError when selectChatModels returns empty array', async () => {
      selectChatModelsStub.resolves([])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmAuthError, 'Should be LlmAuthError')
          assert.ok(
            (err as LlmAuthError).message.includes('No Copilot models available'),
            `Message should include 'No Copilot models available', got: ${(err as Error).message}`
          )
          return true
        }
      )
    })

    it('throws LlmAuthError when sendRequest throws an auth-related error', async () => {
      const authError = new Error('User did not consent to using the model')
      ;(authError as unknown as Record<string, unknown>).code = 'NoPermissions'
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: sinon.stub().rejects(authError),
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmAuthError, 'Should be LlmAuthError')
          return true
        }
      )
    })

    it('throws LlmRateLimitError when sendRequest throws a rate limit error', async () => {
      const rateLimitError = new Error('Rate limit exceeded')
      ;(rateLimitError as unknown as Record<string, unknown>).code = 'RateLimitExceeded'
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: sinon.stub().rejects(rateLimitError),
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmRateLimitError, 'Should be LlmRateLimitError')
          return true
        }
      )
    })
  })

  describe('edge cases', () => {
    it('handles empty messages array', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable(['response']),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const result = await collectChunks(
        provider.sendMessage([], {}, tokenSource.token)
      )

      assert.equal(result, 'response')
      const chatMessages = mockSendRequest.firstCall.args[0]
      assert.equal(chatMessages.length, 0)
    })

    it('handles response with empty string chunks', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable(['', 'hello', '', 'world', '']),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      const result = await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      assert.equal(result, 'helloworld')
    })

    it('handles response with no chunks (empty async iterable)', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable([]),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      const result = await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      assert.equal(result, '')
    })

    it('uses first model when multiple models are available', async () => {
      const mockSendRequest1 = sinon.stub().resolves({
        text: createAsyncIterable(['from-first']),
      })
      const mockSendRequest2 = sinon.stub().resolves({
        text: createAsyncIterable(['from-second']),
      })
      const mockModel1 = { id: 'model-1', sendRequest: mockSendRequest1 }
      const mockModel2 = { id: 'model-2', sendRequest: mockSendRequest2 }
      selectChatModelsStub.resolves([mockModel1, mockModel2])

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      const result = await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      assert.equal(result, 'from-first')
      assert.ok(mockSendRequest1.calledOnce)
      assert.ok(mockSendRequest2.notCalled)
    })

    it('skips system messages since VS Code LM API does not support them directly', async () => {
      const mockSendRequest = sinon.stub().resolves({
        text: createAsyncIterable(['ok']),
      })
      const mockModel = {
        id: 'copilot-gpt-4',
        sendRequest: mockSendRequest,
      }
      selectChatModelsStub.resolves([mockModel])

      const messages: LlmMessage[] = [
        { role: 'system', content: 'You are a math helper' },
        { role: 'user', content: 'What is 2+2?' },
      ]

      await collectChunks(
        provider.sendMessage(messages, {}, tokenSource.token)
      )

      // System messages should be mapped to User role (VS Code LM API only has User and Assistant)
      const chatMessages = mockSendRequest.firstCall.args[0]
      assert.equal(chatMessages.length, 2)
    })

    it('throws LlmAuthError when selectChatModels rejects', async () => {
      selectChatModelsStub.rejects(new Error('Extension host unavailable'))

      const messages: LlmMessage[] = [
        { role: 'user', content: 'test' },
      ]

      await assert.rejects(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for await (const _chunk of provider.sendMessage(messages, {}, tokenSource.token)) {
            // should not reach here
          }
        },
        (err: unknown) => {
          assert.ok(err instanceof LlmAuthError, 'Should be LlmAuthError')
          return true
        }
      )
    })
  })
})
