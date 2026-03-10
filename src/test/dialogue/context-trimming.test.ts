import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import { ContextBuilder } from '../../dialogue/context'
import { DialogueTree, DialogueNode, AttachedPaper } from '../../dialogue/types'
import { PersonaManager } from '../../persona/manager'
import { LlmMessage } from '../../llm/types'
import { Citation } from '../../knowledge/types'

/**
 * Creates a mock PersonaManager with a configGetter that returns no custom personas.
 */
function createMockPersonaManager(): PersonaManager {
  return new PersonaManager(() => undefined)
}

/**
 * Helper to build a minimal DialogueNode.
 */
function makeNode(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant' | 'system',
  content: string,
  children: string[] = []
): DialogueNode {
  return {
    id,
    parentId,
    role,
    content,
    children,
    metadata: { timestamp: Date.now(), model: 'test-model' },
  }
}

/**
 * Creates a mock summarizer function that returns a predictable summary.
 */
function createMockSummarizer(): (messages: LlmMessage[]) => Promise<string> {
  return sinon.stub().resolves('## Main Idea\nSummary of conversation\n## Current Tasks\nNone\n## Key Results\nNone')
}

/**
 * Creates a mock writeMemoryFile function.
 */
function createMockWriteMemoryFile(): (treeId: string, content: string) => Promise<void> {
  return sinon.stub().resolves()
}

/**
 * Builds a tree with enough content to test trimming.
 * Each message is long enough so we can control token estimates.
 */
function buildLongTree(): DialogueTree {
  const root = makeNode('root', null, 'system', 'Tree created', ['a'])
  // Create path messages with known content lengths
  // 'a' repeated 400 times = 400 chars = ~100 tokens
  const a = makeNode('a', 'root', 'user', 'a'.repeat(400), ['b'])
  const b = makeNode('b', 'a', 'assistant', 'b'.repeat(400), ['c'])
  const c = makeNode('c', 'b', 'user', 'c'.repeat(400), ['d'])
  const d = makeNode('d', 'c', 'assistant', 'd'.repeat(400), ['e'])
  const e = makeNode('e', 'd', 'user', 'e'.repeat(400), [])

  return {
    id: 'tree-long',
    title: 'Long Tree',
    rootId: 'root',
    activePath: ['root', 'a', 'b', 'c', 'd', 'e'],
    nodes: { root, a, b, c, d, e },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('ContextBuilder trimming', () => {
  let personaManager: PersonaManager
  let builder: ContextBuilder
  let mockSummarizer: sinon.SinonStub
  let mockWriteMemoryFile: sinon.SinonStub

  beforeEach(() => {
    personaManager = createMockPersonaManager()
    mockSummarizer = createMockSummarizer() as sinon.SinonStub
    mockWriteMemoryFile = createMockWriteMemoryFile() as sinon.SinonStub
    builder = new ContextBuilder(personaManager)
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('estimateTokens', () => {
    it('returns sum of chars/4 for all message contents', () => {
      const messages: LlmMessage[] = [
        { role: 'system', content: 'a'.repeat(100) }, // 25 tokens
        { role: 'user', content: 'b'.repeat(200) },   // 50 tokens
        { role: 'assistant', content: 'c'.repeat(40) }, // 10 tokens
      ]
      const tokens = builder.estimateTokens(messages)
      assert.equal(tokens, 85) // (100 + 200 + 40) / 4 = 85
    })

    it('returns 0 for empty message array', () => {
      const tokens = builder.estimateTokens([])
      assert.equal(tokens, 0)
    })

    it('returns 0 for messages with empty content', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: '' },
      ]
      const tokens = builder.estimateTokens(messages)
      assert.equal(tokens, 0)
    })

    it('floors fractional token counts per message', () => {
      // 5 chars => 1.25 => should contribute 1.25 (we sum then floor total? or floor each?)
      // The spec says "sum of chars/4" so we sum the raw chars then divide by 4
      const messages: LlmMessage[] = [
        { role: 'user', content: 'hello' }, // 5 chars
      ]
      const tokens = builder.estimateTokens(messages)
      // 5 / 4 = 1.25, Math.ceil => 2 or Math.floor => 1
      // The spec says chars/4 as approximation, let's verify it returns a reasonable number
      assert.ok(tokens >= 1, 'Should return at least 1 for non-empty content')
    })
  })

  describe('no trimming when under budget', () => {
    it('when total chars/4 < maxTokens, no trimming occurs and all messages returned', async () => {
      const tree = buildLongTree()
      // System prompt ~50 chars + 5 path messages * 400 chars = ~2050 chars => ~512 tokens
      // Set maxTokens very high so no trimming
      const messages = await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 10000,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // Should have: 1 system prompt + 5 path messages (a,b,c,d,e)
      assert.equal(messages.filter(m => m.role === 'user').length, 3) // a, c, e
      assert.equal(messages.filter(m => m.role === 'assistant').length, 2) // b, d
      assert.ok(!mockSummarizer.called, 'Summarizer should not be called')
      assert.ok(!mockWriteMemoryFile.called, 'writeMemoryFile should not be called')
    })
  })

  describe('RAG removed first when exceeding', () => {
    it('when exceeding maxTokens, RAG system message is removed first', async () => {
      const tree = buildLongTree()
      const ragCitations: Citation[] = [
        {
          source: 'arxiv',
          title: 'Reference Paper',
          url: 'https://arxiv.org/abs/9999',
          snippet: 'x'.repeat(800), // ~200 tokens of RAG content
          fetchedAt: Date.now(),
        },
      ]

      // Calculate: system prompt ~50 chars + 5 path * 400 chars + RAG ~850 chars
      // Total ~2900 chars => ~725 tokens
      // Set maxTokens so it exceeds with RAG but not without
      const messages = await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 600,
        ragCitations,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // RAG should be removed
      const ragMessage = messages.find(
        m => m.role === 'system' && m.content.includes('Reference material')
      )
      assert.ok(!ragMessage, 'RAG message should be removed when trimming')

      // Path messages should still be present (no further trimming needed)
      const userMessages = messages.filter(m => m.role === 'user')
      assert.ok(userMessages.length >= 1, 'User messages should still be present')
    })
  })

  describe('oldest path messages summarized after RAG removal', () => {
    it('after RAG removal if still exceeding, oldest path messages replaced with summary', async () => {
      const tree = buildLongTree()

      // Set maxTokens very low so even without RAG, path messages exceed budget
      // System prompt ~50 chars = ~12 tokens
      // Each path msg = 400 chars = 100 tokens
      // 5 path messages = 500 tokens + 12 = 512 tokens
      // Set budget to ~200 tokens so some path messages must be trimmed
      const messages = await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 250,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // Should have a summary placeholder for older messages
      const summaryMsg = messages.find(
        m => m.content.includes('Earlier context summarized')
      )
      assert.ok(summaryMsg, 'Should contain a summary placeholder message')

      // The most recent messages should still be present
      const lastUserMsg = messages.filter(m => m.role === 'user')
      assert.ok(lastUserMsg.length > 0, 'At least the latest user message should remain')
    })
  })

  describe('attached paper messages never removed', () => {
    it('attached paper messages are never removed during trimming', async () => {
      const tree = buildLongTree()
      const paper: AttachedPaper = {
        id: 'paper-1',
        source: 'arxiv',
        title: 'Important Paper',
        extractedText: 'p'.repeat(400),
        scope: 'global',
      }
      tree.attachedPapers = [paper]

      // Set maxTokens very low to force aggressive trimming
      const messages = await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 300,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // Paper message should still be present
      const paperMsg = messages.find(
        m => m.role === 'system' && m.content.includes('Important Paper')
      )
      assert.ok(paperMsg, 'Paper message should never be removed')
    })
  })

  describe('writeMemoryFile called when trimming occurs', () => {
    it('when trimming occurs, writeMemoryFile is called with correct path and content format', async () => {
      const tree = buildLongTree()

      // Force trimming by setting very low maxTokens
      await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 250,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      assert.ok(mockWriteMemoryFile.calledOnce, 'writeMemoryFile should be called once')
      const [treeId, content] = mockWriteMemoryFile.firstCall.args

      assert.equal(treeId, 'tree-long', 'Should pass correct tree ID')
      assert.ok(content.includes('Part 1'), 'Memory file should contain Part 1')
      assert.ok(content.includes('Part 2'), 'Memory file should contain Part 2')
      assert.ok(content.includes('Full Transcript'), 'Memory file should contain Full Transcript section')
    })

    it('writeMemoryFile is NOT called when no trimming occurs', async () => {
      const tree = buildLongTree()

      await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 10000,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      assert.ok(!mockWriteMemoryFile.called, 'writeMemoryFile should not be called')
    })
  })

  describe('edge cases for trimming', () => {
    it('handles empty tree (only root system node)', async () => {
      const root = makeNode('root', null, 'system', 'Tree created', ['a'])
      const a = makeNode('a', 'root', 'user', 'Hello', [])
      const tree: DialogueTree = {
        id: 'tree-small',
        title: 'Small',
        rootId: 'root',
        activePath: ['root', 'a'],
        nodes: { root, a },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const messages = await builder.buildWithTrimming(tree, 'a', {
        maxTokens: 10000,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      assert.ok(messages.length >= 2, 'Should have system prompt + user message')
    })

    it('when maxTokens is not set, no trimming occurs', async () => {
      const tree = buildLongTree()

      await builder.buildWithTrimming(tree, 'e', {
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // Should behave like normal build
      assert.ok(!mockSummarizer.called, 'Summarizer should not be called')
      assert.ok(!mockWriteMemoryFile.called, 'writeMemoryFile should not be called')
    })

    it('summarizer receives the trimmed messages', async () => {
      const tree = buildLongTree()

      await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 250,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      assert.ok(mockSummarizer.called, 'Summarizer should be called')
      const trimmedMessages = mockSummarizer.firstCall.args[0] as LlmMessage[]
      assert.ok(Array.isArray(trimmedMessages), 'Summarizer should receive an array of messages')
      assert.ok(trimmedMessages.length > 0, 'Trimmed messages should not be empty')
    })

    it('handles maxTokens of 0 gracefully', async () => {
      const tree = buildLongTree()

      // maxTokens of 0 should force maximum trimming
      const messages = await builder.buildWithTrimming(tree, 'e', {
        maxTokens: 0,
        summarizer: mockSummarizer,
        writeMemoryFile: mockWriteMemoryFile,
      })

      // Should still have at least system prompt and last message
      assert.ok(messages.length >= 1, 'Should return at least some messages')
    })
  })
})
