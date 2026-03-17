import * as assert from 'assert'
import { DialogueTree, DialogueNode, NodeMetadata } from '../../dialogue/types'
import { exportToHtml } from '../../export/html'

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

describe('exportToHtml', () => {

  // ---- HTML structure tests ----
  describe('HTML structure', () => {
    it('starts with <!DOCTYPE html>', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.trimStart().startsWith('<!DOCTYPE html>'),
        'output should start with DOCTYPE declaration'
      )
    })

    it('has html, head, and body tags', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(result.includes('<html'), 'should have <html> tag')
      assert.ok(result.includes('<head>'), 'should have <head> tag')
      assert.ok(result.includes('</head>'), 'should have closing </head> tag')
      assert.ok(result.includes('<body>'), 'should have <body> tag')
      assert.ok(result.includes('</body>'), 'should have closing </body> tag')
      assert.ok(result.includes('</html>'), 'should have closing </html> tag')
    })

    it('includes KaTeX CDN stylesheet link in head', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css'),
        'should include KaTeX CDN CSS link'
      )
      assert.ok(
        result.includes('<link') && result.includes('stylesheet'),
        'should include link tag with rel=stylesheet'
      )
    })

    it('body has rendered content from the dialogue tree', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('What is a functor?'),
        'body should contain user message text'
      )
      assert.ok(
        result.includes('A functor is a map between categories.'),
        'body should contain assistant message text'
      )
    })

    it('has an inline style tag', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('<style>') && result.includes('</style>'),
        'should have inline <style> tag'
      )
    })

    it('includes @media print styles', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('@media print'),
        'should include @media print rule'
      )
    })
  })

  // ---- LaTeX rendering ----
  describe('LaTeX rendering', () => {
    it('renders inline LaTeX as KaTeX HTML (class katex)', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'Consider $x^2 + y^2 = z^2$.',
      }
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('katex'),
        'rendered LaTeX should contain class "katex"'
      )
    })

    it('renders display LaTeX as KaTeX HTML', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'Display math:\n$$\\int_0^1 f(x)\\,dx$$',
      }
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('katex'),
        'rendered display LaTeX should contain class "katex"'
      )
    })
  })

  // ---- Empty tree ----
  describe('empty tree', () => {
    it('produces valid HTML for an empty tree', () => {
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
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.trimStart().startsWith('<!DOCTYPE html>'),
        'empty tree should still produce valid DOCTYPE'
      )
      assert.ok(result.includes('<html'), 'empty tree should still have <html>')
      assert.ok(result.includes('</html>'), 'empty tree should still close </html>')
      assert.ok(result.includes('<body>'), 'empty tree should still have <body>')
      assert.ok(result.includes('</body>'), 'empty tree should still close </body>')
    })
  })

  // ---- Edge cases ----
  describe('edge cases', () => {
    it('handles node with empty string content', () => {
      const tree = makeLinearTree()
      tree.nodes['u1'] = { ...tree.nodes['u1'], content: '' }
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.trimStart().startsWith('<!DOCTYPE html>'),
        'should produce valid HTML even with empty content'
      )
    })

    it('handles malformed LaTeX without throwing', () => {
      const tree = makeLinearTree()
      tree.nodes['a1'] = {
        ...tree.nodes['a1'],
        content: 'Broken LaTeX: $\\invalidcommand{$',
      }
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        typeof result === 'string' && result.length > 0,
        'should return valid string even with malformed LaTeX'
      )
      assert.ok(
        result.includes('<!DOCTYPE html>'),
        'should still produce valid HTML structure'
      )
    })

    it('handles tree with undefined activePersona', () => {
      const tree = makeLinearTree({ activePersona: undefined })
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('<!DOCTYPE html>'),
        'should produce valid HTML without persona'
      )
    })

    it('handles content with HTML special characters', () => {
      const tree = makeLinearTree()
      tree.nodes['u1'] = {
        ...tree.nodes['u1'],
        content: 'Is 3 < 5 & 5 > 3?',
      }
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        typeof result === 'string' && result.length > 0,
        'should handle HTML special characters without error'
      )
    })

    it('wraps content in div.content inside body', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('<div class="content">'),
        'should wrap content in div.content'
      )
    })

    it('includes charset and viewport meta tags', () => {
      const tree = makeLinearTree()
      const result = exportToHtml(tree, { mode: 'active-branch' })
      assert.ok(
        result.includes('charset') && result.includes('utf-8'),
        'should include charset meta tag'
      )
      assert.ok(
        result.includes('viewport'),
        'should include viewport meta tag'
      )
    })
  })
})
