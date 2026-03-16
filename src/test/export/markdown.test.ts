import * as assert from 'assert'
import { DialogueTree, DialogueNode, NodeMetadata } from '../../dialogue/types'
import { Citation } from '../../knowledge/types'
import { exportToMarkdown, ExportOptions } from '../../export/markdown'

function makeMetadata(overrides?: Partial<NodeMetadata>): NodeMetadata {
  return {
    timestamp: 1700000000000,
    model: 'gpt-4',
    ...overrides,
  }
}

function makeNode(overrides: Partial<DialogueNode> & { id: string }): DialogueNode {
  return {
    parentId: null,
    role: 'user',
    content: '',
    children: [],
    metadata: makeMetadata(),
    ...overrides,
  }
}

/**
 * Helper: builds a minimal linear tree (root -> user -> assistant).
 */
function makeLinearTree(overrides?: Partial<DialogueTree>): DialogueTree {
  const rootNode = makeNode({
    id: 'root',
    role: 'system',
    content: 'Tree created',
    children: ['u1'],
  })
  const userNode = makeNode({
    id: 'u1',
    parentId: 'root',
    role: 'user',
    content: 'What is a functor?',
    children: ['a1'],
  })
  const assistantNode = makeNode({
    id: 'a1',
    parentId: 'u1',
    role: 'assistant',
    content: 'A functor is a map between categories.',
    children: [],
    metadata: makeMetadata({ model: 'gpt-4', persona: 'Algebraist' }),
  })
  return {
    id: 'tree-1',
    title: 'Category Theory Session',
    rootId: 'root',
    activePath: ['root', 'u1', 'a1'],
    nodes: {
      root: rootNode,
      u1: userNode,
      a1: assistantNode,
    },
    createdAt: 1700000000000,
    updatedAt: 1700000060000,
    activePersona: 'Algebraist',
    ...overrides,
  }
}

/**
 * Helper: builds a branching tree.
 * root -> u1 -> a1 (branch 1)
 *      -> u1 -> a2 (branch 2 from u1)
 */
function makeBranchingTree(): DialogueTree {
  const rootNode = makeNode({
    id: 'root',
    role: 'system',
    content: 'Tree created',
    children: ['u1'],
  })
  const userNode = makeNode({
    id: 'u1',
    parentId: 'root',
    role: 'user',
    content: 'What is a functor?',
    children: ['a1', 'a2'],
  })
  const assistantNode1 = makeNode({
    id: 'a1',
    parentId: 'u1',
    role: 'assistant',
    content: 'A functor maps objects and morphisms.',
    children: ['u2'],
  })
  const userNode2 = makeNode({
    id: 'u2',
    parentId: 'a1',
    role: 'user',
    content: 'Give an example.',
    children: ['a3'],
  })
  const assistantNode3 = makeNode({
    id: 'a3',
    parentId: 'u2',
    role: 'assistant',
    content: 'The forgetful functor from Grp to Set.',
    children: [],
  })
  const assistantNode2 = makeNode({
    id: 'a2',
    parentId: 'u1',
    role: 'assistant',
    content: 'In category theory, a functor is a structure-preserving map.',
    children: [],
  })
  return {
    id: 'tree-2',
    title: 'Branching Session',
    rootId: 'root',
    activePath: ['root', 'u1', 'a1', 'u2', 'a3'],
    nodes: {
      root: rootNode,
      u1: userNode,
      a1: assistantNode1,
      a2: assistantNode2,
      u2: userNode2,
      a3: assistantNode3,
    },
    createdAt: 1700000000000,
    updatedAt: 1700000060000,
  }
}

describe('exportToMarkdown', () => {

  // ---- Active-branch mode ----
  describe('active-branch mode', () => {
    it('exports messages along the active path, skipping system nodes', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('**User:** What is a functor?'))
      assert.ok(result.includes('**Assistant:** A functor is a map between categories.'))
      assert.ok(!result.includes('Tree created'), 'system content should be excluded')
    })

    it('starts with a header containing tree title', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.startsWith('# Research Session: Category Theory Session'))
    })

    it('includes metadata block with date, persona, model', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('Persona: Algebraist'), 'should include persona')
      assert.ok(result.includes('Model: gpt-4'), 'should include model')
    })

    it('separates messages with --- delimiter', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      const lines = result.split('\n')
      const separators = lines.filter(l => l.trim() === '---')
      assert.ok(separators.length >= 1, 'should have at least one separator between messages')
    })
  })

  // ---- Message formatting ----
  describe('message formatting', () => {
    it('formats user messages as **User:** content', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('**User:** What is a functor?'))
    })

    it('formats assistant messages as **Assistant:** content', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('**Assistant:** A functor is a map between categories.'))
    })
  })

  // ---- LaTeX preservation ----
  describe('LaTeX preservation', () => {
    it('preserves inline LaTeX $...$ as-is', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'Consider the functor $F: \\mathcal{C} \\to \\mathcal{D}$.',
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('$F: \\mathcal{C} \\to \\mathcal{D}$'),
        'inline LaTeX should be preserved'
      )
    })

    it('preserves display LaTeX $$...$$ as-is', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'The equation is:\n$$\\int_0^1 f(x)\\,dx = F(1) - F(0)$$',
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('$$\\int_0^1 f(x)\\,dx = F(1) - F(0)$$'),
        'display LaTeX should be preserved'
      )
    })
  })

  // ---- Citations ----
  describe('citations', () => {
    it('renders RAG citations as blockquotes', () => {
      const citations: Citation[] = [
        {
          source: 'arxiv',
          title: 'Category Theory for Scientists',
          url: 'https://arxiv.org/abs/1234.5678',
          snippet: 'A functor is...',
          fetchedAt: 1700000000000,
        },
        {
          source: 'nlab',
          title: 'Functor',
          url: 'https://ncatlab.org/nlab/show/functor',
          snippet: 'In category theory...',
          fetchedAt: 1700000000000,
        },
      ]
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        metadata: makeMetadata({ sources: citations }),
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('> Sources:'),
        'should have sources blockquote'
      )
      assert.ok(
        result.includes('[Category Theory for Scientists](https://arxiv.org/abs/1234.5678)'),
        'should include first citation link'
      )
      assert.ok(
        result.includes('[Functor](https://ncatlab.org/nlab/show/functor)'),
        'should include second citation link'
      )
    })

    it('omits citation block when sources is undefined', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(!result.includes('> Sources:'), 'no sources block when none present')
    })

    it('omits citation block when sources array is empty', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        metadata: makeMetadata({ sources: [] }),
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(!result.includes('> Sources:'), 'no sources block when array empty')
    })
  })

  // ---- Full-tree mode ----
  describe('full-tree mode', () => {
    it('exports all branches with ## Branch N headings', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'full-tree' })
      assert.ok(result.includes('## Branch 1'), 'should have Branch 1 heading')
      assert.ok(result.includes('## Branch 2'), 'should have Branch 2 heading')
    })

    it('includes messages from each branch', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'full-tree' })
      assert.ok(
        result.includes('A functor maps objects and morphisms.'),
        'should include branch 1 assistant content'
      )
      assert.ok(
        result.includes('a functor is a structure-preserving map'),
        'should include branch 2 assistant content'
      )
    })

    it('warns if more than 10 branches', () => {
      // Build a tree with 11 children of the root user node
      const rootNode = makeNode({
        id: 'root',
        role: 'system',
        content: 'Tree created',
        children: ['u1'],
      })
      const childIds = Array.from({ length: 11 }, (_, i) => `a${i}`)
      const userNode = makeNode({
        id: 'u1',
        parentId: 'root',
        role: 'user',
        content: 'Question',
        children: childIds,
      })
      const nodes: Record<string, DialogueNode> = { root: rootNode, u1: userNode }
      for (let i = 0; i < 11; i++) {
        nodes[`a${i}`] = makeNode({
          id: `a${i}`,
          parentId: 'u1',
          role: 'assistant',
          content: `Answer ${i}`,
          children: [],
        })
      }
      const tree: DialogueTree = {
        id: 'tree-many',
        title: 'Many Branches',
        rootId: 'root',
        activePath: ['root', 'u1', 'a0'],
        nodes,
        createdAt: 1700000000000,
        updatedAt: 1700000060000,
      }
      const result = exportToMarkdown(tree, { mode: 'full-tree' })
      assert.ok(
        result.includes('> **Warning:**') || result.includes('> Warning:'),
        'should include a warning about >10 branches'
      )
    })
  })

  // ---- From-node mode ----
  describe('from-node mode', () => {
    it('exports from specified node down to leaf', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'from-node', fromNodeId: 'a1' })
      assert.ok(
        result.includes('A functor maps objects and morphisms.'),
        'should include the starting node content'
      )
      assert.ok(
        result.includes('Give an example.'),
        'should include child user content'
      )
      assert.ok(
        result.includes('The forgetful functor from Grp to Set.'),
        'should include grandchild content'
      )
    })

    it('does not include nodes from other branches', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'from-node', fromNodeId: 'a1' })
      assert.ok(
        !result.includes('structure-preserving map'),
        'should not include content from sibling branch'
      )
    })

    it('handles a leaf node (no children)', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'from-node', fromNodeId: 'a2' })
      assert.ok(
        result.includes('a functor is a structure-preserving map'),
        'should include the leaf node content'
      )
    })
  })

  // ---- Branch point comments ----
  describe('branch point comments', () => {
    it('annotates branch points with HTML comments', () => {
      const tree = makeBranchingTree()
      const result = exportToMarkdown(tree, { mode: 'full-tree' })
      assert.ok(
        result.includes('<!-- Branch: 2 siblings -->'),
        'should annotate the branch point with sibling count'
      )
    })
  })

  // ---- Empty tree ----
  describe('empty tree', () => {
    it('exports header and no messages for a tree with only a root node', () => {
      const rootNode = makeNode({
        id: 'root',
        role: 'system',
        content: 'Tree created',
        children: [],
      })
      const tree: DialogueTree = {
        id: 'tree-empty',
        title: 'Empty Session',
        rootId: 'root',
        activePath: [],
        nodes: { root: rootNode },
        createdAt: 1700000000000,
        updatedAt: 1700000060000,
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('# Research Session: Empty Session'))
      assert.ok(!result.includes('**User:**'))
      assert.ok(!result.includes('**Assistant:**'))
    })
  })

  // ---- No activePath ----
  describe('no activePath', () => {
    it('returns header-only output when activePath is empty in active-branch mode', () => {
      const tree = makeLinearTree({ activePath: [] })
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('# Research Session:'))
      assert.ok(!result.includes('**User:**'))
      assert.ok(!result.includes('**Assistant:**'))
    })
  })

  // ---- Edge cases ----
  describe('edge cases', () => {
    it('handles node with empty string content', () => {
      const tree = makeLinearTree()
      tree.nodes['u1'] = { ...tree.nodes['u1'], content: '' }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('**User:** '), 'should still render user label for empty content')
    })

    it('handles node content with only whitespace', () => {
      const tree = makeLinearTree()
      tree.nodes['u1'] = { ...tree.nodes['u1'], content: '   ' }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(typeof result === 'string', 'should return a string without errors')
    })

    it('handles tree with undefined activePersona', () => {
      const tree = makeLinearTree({ activePersona: undefined })
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(!result.includes('Persona: undefined'), 'should not print undefined persona')
    })

    it('handles from-node with invalid nodeId gracefully', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, { mode: 'from-node', fromNodeId: 'nonexistent' })
      assert.ok(typeof result === 'string', 'should return a string')
      assert.ok(result.includes('# Research Session:'), 'should still have a header')
    })

    it('handles tree with single user message (no assistant reply)', () => {
      const rootNode = makeNode({
        id: 'root',
        role: 'system',
        content: 'Tree created',
        children: ['u1'],
      })
      const userNode = makeNode({
        id: 'u1',
        parentId: 'root',
        role: 'user',
        content: 'Hello?',
        children: [],
      })
      const tree: DialogueTree = {
        id: 'tree-single',
        title: 'Single Message',
        rootId: 'root',
        activePath: ['root', 'u1'],
        nodes: { root: rootNode, u1: userNode },
        createdAt: 1700000000000,
        updatedAt: 1700000060000,
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('**User:** Hello?'))
      assert.ok(!result.includes('**Assistant:**'))
    })

    it('defaults to active-branch when no mode is specified', () => {
      const tree = makeLinearTree()
      const result = exportToMarkdown(tree, {} as ExportOptions)
      assert.ok(result.includes('**User:** What is a functor?'))
    })

    it('handles multiple consecutive LaTeX blocks without corruption', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'We have $a + b = c$ and also $x^2 + y^2 = z^2$.\n\nDisplay:\n$$E = mc^2$$\n$$F = ma$$',
      }
      const result = exportToMarkdown(tree, { mode: 'active-branch' })
      assert.ok(result.includes('$a + b = c$'))
      assert.ok(result.includes('$x^2 + y^2 = z^2$'))
      assert.ok(result.includes('$$E = mc^2$$'))
      assert.ok(result.includes('$$F = ma$$'))
    })
  })
})
