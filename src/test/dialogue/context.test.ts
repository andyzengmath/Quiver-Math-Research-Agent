import { strict as assert } from 'assert'
import { ContextBuilder } from '../../dialogue/context'
import { DialogueTree, DialogueNode, AttachedPaper } from '../../dialogue/types'
import { PersonaManager } from '../../persona/manager'
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
 * Builds a linear dialogue tree: root -> A (user) -> B (assistant) -> C (user)
 */
function buildLinearTree(): DialogueTree {
  const root = makeNode('root', null, 'system', 'Tree created', ['a'])
  const a = makeNode('a', 'root', 'user', 'What is a group?', ['b'])
  const b = makeNode('b', 'a', 'assistant', 'A group is an algebraic structure...', ['c'])
  const c = makeNode('c', 'b', 'user', 'Can you give an example?', [])

  return {
    id: 'tree-1',
    title: 'Linear Tree',
    rootId: 'root',
    activePath: ['root', 'a', 'b', 'c'],
    nodes: { root, a, b, c },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/**
 * Builds a branching tree:
 *       root
 *        |
 *        a (user)
 *       / \
 *      b   d (assistant branches)
 *      |   |
 *      c   e (user nodes on each branch)
 */
function buildBranchingTree(): DialogueTree {
  const root = makeNode('root', null, 'system', 'Tree created', ['a'])
  const a = makeNode('a', 'root', 'user', 'Explain topology', ['b', 'd'])
  const b = makeNode('b', 'a', 'assistant', 'Topology studies shapes...', ['c'])
  const c = makeNode('c', 'b', 'user', 'What about homology?', [])
  const d = makeNode('d', 'a', 'assistant', 'Topology is about open sets...', ['e'])
  const e = makeNode('e', 'd', 'user', 'Tell me about continuity', [])

  return {
    id: 'tree-2',
    title: 'Branching Tree',
    rootId: 'root',
    activePath: ['root', 'a', 'b', 'c'],
    nodes: { root, a, b, c, d, e },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

describe('ContextBuilder', () => {
  let personaManager: PersonaManager
  let builder: ContextBuilder

  beforeEach(() => {
    personaManager = createMockPersonaManager()
    builder = new ContextBuilder(personaManager)
  })

  describe('build() with persona system prompt', () => {
    it('returns messages starting with system prompt from persona', () => {
      const tree = buildLinearTree()
      const messages = builder.build(tree, 'c', { persona: 'algebraist' })

      assert.ok(messages.length > 0, 'Should return at least one message')
      assert.equal(messages[0].role, 'system')
      assert.ok(
        messages[0].content.includes('algebraist'),
        'System prompt should contain persona content'
      )
    })

    it('uses default math assistant system prompt when no persona specified', () => {
      const tree = buildLinearTree()
      const messages = builder.build(tree, 'c')

      assert.ok(messages.length > 0)
      assert.equal(messages[0].role, 'system')
      assert.ok(
        messages[0].content.toLowerCase().includes('math'),
        'Default prompt should mention math'
      )
    })
  })

  describe('path messages ordering', () => {
    it('path messages are in order from root to target node excluding root system node', () => {
      const tree = buildLinearTree()
      const messages = builder.build(tree, 'c')

      // First message is system prompt
      // Then path messages (excluding root system node): a (user), b (assistant), c (user)
      const pathMessages = messages.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      )

      assert.equal(pathMessages.length, 3)
      assert.equal(pathMessages[0].content, 'What is a group?')
      assert.equal(pathMessages[1].content, 'A group is an algebraic structure...')
      assert.equal(pathMessages[2].content, 'Can you give an example?')
    })

    it('builds correct path for intermediate node', () => {
      const tree = buildLinearTree()
      const messages = builder.build(tree, 'b')

      const pathMessages = messages.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      )

      assert.equal(pathMessages.length, 2)
      assert.equal(pathMessages[0].content, 'What is a group?')
      assert.equal(pathMessages[1].content, 'A group is an algebraic structure...')
    })
  })

  describe('sibling branch exclusion', () => {
    it('does NOT include sibling branch messages when building path to c', () => {
      const tree = buildBranchingTree()
      const messages = builder.build(tree, 'c')

      const allContents = messages.map((m) => m.content)
      assert.ok(
        !allContents.some((c) => c.includes('open sets')),
        'Should not include sibling branch assistant message'
      )
      assert.ok(
        !allContents.some((c) => c.includes('continuity')),
        'Should not include sibling branch user message'
      )
    })

    it('includes correct branch messages when building path to e (other branch)', () => {
      const tree = buildBranchingTree()
      const messages = builder.build(tree, 'e')

      const pathMessages = messages.filter(
        (m) => m.role === 'user' || m.role === 'assistant'
      )

      assert.equal(pathMessages.length, 3)
      assert.equal(pathMessages[0].content, 'Explain topology')
      assert.equal(pathMessages[1].content, 'Topology is about open sets...')
      assert.equal(pathMessages[2].content, 'Tell me about continuity')

      const allContents = messages.map((m) => m.content)
      assert.ok(
        !allContents.some((c) => c.includes('homology')),
        'Should not include other branch messages'
      )
    })
  })

  describe('attached papers with global scope', () => {
    it('includes global-scope attached paper as system message after system prompt', () => {
      const tree = buildLinearTree()
      const paper: AttachedPaper = {
        id: 'paper-1',
        source: 'arxiv',
        title: 'Introduction to Group Theory',
        extractedText: 'Groups are fundamental algebraic structures...',
        scope: 'global',
      }
      tree.attachedPapers = [paper]

      const messages = builder.build(tree, 'c')

      // First message: system prompt
      assert.equal(messages[0].role, 'system')
      // Second message: attached paper
      assert.equal(messages[1].role, 'system')
      assert.ok(
        messages[1].content.includes('Introduction to Group Theory'),
        'Paper system message should include paper title'
      )
      assert.ok(
        messages[1].content.includes('Groups are fundamental algebraic structures...'),
        'Paper system message should include paper text'
      )
    })
  })

  describe('RAG citations', () => {
    it('includes RAG citations as system message before the last user message', () => {
      const tree = buildLinearTree()
      const citations: Citation[] = [
        {
          source: 'arxiv',
          title: 'Abstract Algebra Primer',
          url: 'https://arxiv.org/abs/1234',
          snippet: 'A group (G, *) satisfies closure, associativity...',
          fetchedAt: Date.now(),
        },
      ]

      const messages = builder.build(tree, 'c', { ragCitations: citations })

      // Find the RAG system message
      const ragMessage = messages.find(
        (m) => m.role === 'system' && m.content.includes('Reference material')
      )
      assert.ok(ragMessage, 'Should include a RAG citations system message')
      assert.ok(
        ragMessage!.content.includes('Abstract Algebra Primer'),
        'RAG message should include citation title'
      )
      assert.ok(
        ragMessage!.content.includes('A group (G, *) satisfies closure'),
        'RAG message should include citation snippet'
      )
    })
  })

  describe('branch-scoped attached paper', () => {
    it('includes branch-scoped paper only when building context for that branch', () => {
      const tree = buildBranchingTree()
      const branchPaper: AttachedPaper = {
        id: 'paper-branch',
        source: 'arxiv',
        title: 'Homological Algebra',
        extractedText: 'Chain complexes and derived functors...',
        scope: 'branch',
        branchId: 'b',
      }
      tree.attachedPapers = [branchPaper]

      // Building context for node c (on branch through b) should include the paper
      const messagesForC = builder.build(tree, 'c')
      const paperMsgC = messagesForC.find(
        (m) => m.role === 'system' && m.content.includes('Homological Algebra')
      )
      assert.ok(paperMsgC, 'Branch paper should be included for node on that branch')

      // Building context for node e (on branch through d) should NOT include the paper
      const messagesForE = builder.build(tree, 'e')
      const paperMsgE = messagesForE.find(
        (m) => m.role === 'system' && m.content.includes('Homological Algebra')
      )
      assert.ok(!paperMsgE, 'Branch paper should NOT be included for node on other branch')
    })
  })

  describe('edge cases', () => {
    it('handles tree with only root and one user node', () => {
      const root = makeNode('root', null, 'system', 'Tree created', ['a'])
      const a = makeNode('a', 'root', 'user', 'Hello', [])
      const tree: DialogueTree = {
        id: 'tree-small',
        title: 'Small Tree',
        rootId: 'root',
        activePath: ['root', 'a'],
        nodes: { root, a },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const messages = builder.build(tree, 'a')
      const pathMessages = messages.filter((m) => m.role === 'user')
      assert.equal(pathMessages.length, 1)
      assert.equal(pathMessages[0].content, 'Hello')
    })

    it('handles empty attachedPapers array', () => {
      const tree = buildLinearTree()
      tree.attachedPapers = []
      const messages = builder.build(tree, 'c')

      // Should just have system prompt + path messages, no paper messages
      const systemMessages = messages.filter((m) => m.role === 'system')
      assert.equal(systemMessages.length, 1, 'Only persona system prompt, no paper messages')
    })

    it('handles undefined attachedPapers', () => {
      const tree = buildLinearTree()
      delete (tree as { attachedPapers?: unknown }).attachedPapers
      const messages = builder.build(tree, 'c')
      assert.ok(messages.length > 0, 'Should still return messages without attachedPapers')
    })

    it('handles multiple global papers', () => {
      const tree = buildLinearTree()
      tree.attachedPapers = [
        {
          id: 'p1',
          source: 'arxiv',
          title: 'Paper One',
          extractedText: 'Content one',
          scope: 'global',
        },
        {
          id: 'p2',
          source: 'local-pdf',
          title: 'Paper Two',
          extractedText: 'Content two',
          scope: 'global',
        },
      ]

      const messages = builder.build(tree, 'c')
      const paperMessages = messages.filter(
        (m) => m.role === 'system' && m !== messages[0]
      )
      // Should have at least the paper content
      const allContent = paperMessages.map((m) => m.content).join(' ')
      assert.ok(allContent.includes('Paper One'), 'Should include first paper')
      assert.ok(allContent.includes('Paper Two'), 'Should include second paper')
    })

    it('handles empty ragCitations array', () => {
      const tree = buildLinearTree()
      const messages = builder.build(tree, 'c', { ragCitations: [] })

      const ragMessage = messages.find(
        (m) => m.role === 'system' && m.content.includes('Reference material')
      )
      assert.ok(!ragMessage, 'Should not include RAG message for empty citations array')
    })

    it('handles multiple RAG citations', () => {
      const tree = buildLinearTree()
      const citations: Citation[] = [
        {
          source: 'arxiv',
          title: 'Citation A',
          url: 'https://arxiv.org/a',
          snippet: 'Snippet A content',
          fetchedAt: Date.now(),
        },
        {
          source: 'wikipedia',
          title: 'Citation B',
          url: 'https://en.wikipedia.org/b',
          snippet: 'Snippet B content',
          fetchedAt: Date.now(),
        },
      ]

      const messages = builder.build(tree, 'c', { ragCitations: citations })
      const ragMessage = messages.find(
        (m) => m.role === 'system' && m.content.includes('Reference material')
      )
      assert.ok(ragMessage)
      assert.ok(ragMessage!.content.includes('Citation A'))
      assert.ok(ragMessage!.content.includes('Citation B'))
      assert.ok(ragMessage!.content.includes('Snippet A content'))
      assert.ok(ragMessage!.content.includes('Snippet B content'))
    })

    it('throws or handles gracefully when nodeId does not exist in tree', () => {
      const tree = buildLinearTree()
      assert.throws(
        () => builder.build(tree, 'nonexistent'),
        (err: Error) => err.message.includes('nonexistent')
      )
    })
  })
})
