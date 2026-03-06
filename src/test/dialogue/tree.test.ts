import * as assert from 'assert'
import { TreeManager } from '../../dialogue/tree'
import { NodeMetadata } from '../../dialogue/types'

function makeMetadata(overrides?: Partial<NodeMetadata>): NodeMetadata {
  return {
    timestamp: Date.now(),
    model: 'test-model',
    ...overrides,
  }
}

describe('TreeManager', () => {
  let manager: TreeManager

  beforeEach(() => {
    manager = new TreeManager()
  })

  describe('createTree', () => {
    it('returns a tree with a root node, empty activePath, and given title', () => {
      const tree = manager.createTree('My Research')

      assert.strictEqual(tree.title, 'My Research')
      assert.ok(tree.id, 'tree should have an id')
      assert.ok(tree.rootId, 'tree should have a rootId')
      assert.deepStrictEqual(tree.activePath, [])
      assert.ok(tree.nodes[tree.rootId], 'root node should exist in nodes')

      const root = tree.nodes[tree.rootId]
      assert.strictEqual(root.role, 'system')
      assert.strictEqual(root.content, 'Tree created')
      assert.strictEqual(root.parentId, null)
      assert.deepStrictEqual(root.children, [])
      assert.ok(tree.createdAt > 0)
      assert.ok(tree.updatedAt > 0)
    })
  })

  describe('addNode', () => {
    it('creates a node with correct parentId and adds it to parent children', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()
      const node = manager.addNode(tree.id, tree.rootId, 'user', 'Hello', metadata)

      assert.strictEqual(node.parentId, tree.rootId)
      assert.strictEqual(node.role, 'user')
      assert.strictEqual(node.content, 'Hello')
      assert.deepStrictEqual(node.children, [])

      const updatedTree = manager.getTree(tree.id)
      const root = updatedTree.nodes[updatedTree.rootId]
      assert.ok(root.children.includes(node.id), 'root children should include new node')
    })

    it('sets activePath to [rootId, newNodeId] when adding to root', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()
      const node = manager.addNode(tree.id, tree.rootId, 'user', 'First message', metadata)

      const updatedTree = manager.getTree(tree.id)
      assert.deepStrictEqual(updatedTree.activePath, [tree.rootId, node.id])
    })

    it('throws when parentId does not exist in the tree', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      assert.throws(
        () => manager.addNode(tree.id, 'nonexistent-id', 'user', 'Hello', metadata),
        /parent node/i
      )
    })
  })

  describe('forkFrom', () => {
    it('creates a new child on the specified node and updates activePath to path through new child', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      // Build a chain: root -> n1 -> n2
      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)

      // Fork from n1 (creating a sibling of n2)
      const forked = manager.forkFrom(tree.id, n1.id)

      const updatedTree = manager.getTree(tree.id)
      const parentNode = updatedTree.nodes[n1.id]

      // The forked node should be a child of n1
      assert.ok(parentNode.children.includes(forked.id))
      assert.strictEqual(parentNode.children.length, 2) // n2 and forked

      // activePath should go through the fork point: root -> n1 -> forked
      assert.deepStrictEqual(updatedTree.activePath, [tree.rootId, n1.id, forked.id])
    })
  })

  describe('switchBranch', () => {
    it('updates activePath to follow the specified node lineage from root to deepest leaf', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      // root -> n1 -> n2
      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      const n2 = manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)

      // Fork from n1 to create branch: root -> n1 -> forked
      manager.forkFrom(tree.id, n1.id)

      // Now switch back to n2 branch
      manager.switchBranch(tree.id, n2.id)
      const updatedTree = manager.getTree(tree.id)

      assert.deepStrictEqual(updatedTree.activePath, [tree.rootId, n1.id, n2.id])
    })

    it('throws when nodeId does not exist', () => {
      const tree = manager.createTree('Test')

      assert.throws(
        () => manager.switchBranch(tree.id, 'nonexistent-id'),
        /node/i
      )
    })
  })

  describe('deleteBranch', () => {
    it('removes node and all descendants, removes from parent children', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      // root -> n1 -> n2 -> n3
      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      const n2 = manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)
      const n3 = manager.addNode(tree.id, n2.id, 'user', 'msg2', metadata)

      // Delete n2 (should also delete n3)
      manager.deleteBranch(tree.id, n2.id)

      const updatedTree = manager.getTree(tree.id)
      assert.strictEqual(updatedTree.nodes[n2.id], undefined, 'n2 should be deleted')
      assert.strictEqual(updatedTree.nodes[n3.id], undefined, 'n3 should be deleted')

      const n1Node = updatedTree.nodes[n1.id]
      assert.ok(!n1Node.children.includes(n2.id), 'n2 should be removed from n1 children')
    })

    it('switches activePath to sibling or parent when deleting node on active path', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      // root -> n1 -> n2 (active path)
      // root -> n1 -> n2b (sibling)
      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      const n2 = manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)

      // Fork to create sibling n2b
      manager.forkFrom(tree.id, n1.id)

      // Switch back to n2 so it is the active path
      manager.switchBranch(tree.id, n2.id)

      // Delete n2 - activePath should switch to sibling n2b or fall back to parent n1
      manager.deleteBranch(tree.id, n2.id)

      const updatedTree = manager.getTree(tree.id)
      // activePath should not contain n2
      assert.ok(!updatedTree.activePath.includes(n2.id), 'deleted node should not be in activePath')
      // activePath should still be valid (either through sibling or just to parent)
      assert.ok(updatedTree.activePath.length > 0, 'activePath should not be empty')
      assert.strictEqual(updatedTree.activePath[0], tree.rootId, 'activePath should start from root')
    })

    it('throws when trying to delete the root node', () => {
      const tree = manager.createTree('Test')

      assert.throws(
        () => manager.deleteBranch(tree.id, tree.rootId),
        /root/i
      )
    })
  })

  describe('getActivePath', () => {
    it('returns ordered nodes from root to leaf', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      const n2 = manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)

      const path = manager.getActivePath(tree.id)

      assert.strictEqual(path.length, 3)
      assert.strictEqual(path[0].id, tree.rootId)
      assert.strictEqual(path[1].id, n1.id)
      assert.strictEqual(path[2].id, n2.id)
    })
  })

  describe('loadTree', () => {
    it('loads an externally created tree into the manager', () => {
      const tree = manager.createTree('Original')
      const serialized = manager.getTree(tree.id)

      const manager2 = new TreeManager()
      manager2.loadTree(serialized)

      const loaded = manager2.getTree(tree.id)
      assert.strictEqual(loaded.title, 'Original')
      assert.strictEqual(loaded.rootId, tree.rootId)
    })
  })

  describe('boundary cases', () => {
    it('addNode throws for invalid treeId', () => {
      const metadata = makeMetadata()
      assert.throws(
        () => manager.addNode('no-such-tree', 'some-parent', 'user', 'Hi', metadata),
        /tree/i
      )
    })

    it('getTree throws for invalid treeId', () => {
      assert.throws(
        () => manager.getTree('no-such-tree'),
        /tree/i
      )
    })

    it('getActivePath returns empty array when activePath is empty', () => {
      const tree = manager.createTree('Test')
      // newly created tree has empty activePath
      const path = manager.getActivePath(tree.id)
      assert.deepStrictEqual(path, [])
    })

    it('switchBranch walks down to the deepest leaf via first child', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      // root -> n1 -> n2 -> n3
      //              -> n2b
      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)
      const n2 = manager.addNode(tree.id, n1.id, 'assistant', 'reply1', metadata)
      const n3 = manager.addNode(tree.id, n2.id, 'user', 'msg2', metadata)

      // Fork from n1 to create n2b
      manager.forkFrom(tree.id, n1.id)

      // Switch to n2 — should walk down to n3 (deepest leaf following first child)
      manager.switchBranch(tree.id, n2.id)
      const updatedTree = manager.getTree(tree.id)

      assert.deepStrictEqual(updatedTree.activePath, [tree.rootId, n1.id, n2.id, n3.id])
    })

    it('deleteBranch falls back to parent when no sibling exists', () => {
      const tree = manager.createTree('Test')
      const metadata = makeMetadata()

      const n1 = manager.addNode(tree.id, tree.rootId, 'user', 'msg1', metadata)

      // active path is [root, n1]
      manager.deleteBranch(tree.id, n1.id)

      const updatedTree = manager.getTree(tree.id)
      // Should fall back to just root since n1 was the only child
      assert.ok(!updatedTree.activePath.includes(n1.id))
      // activePath should still be reasonable
      assert.ok(updatedTree.activePath.length <= 1)
    })
  })
})
