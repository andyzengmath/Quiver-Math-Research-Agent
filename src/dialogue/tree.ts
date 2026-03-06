import { v4 as uuidv4 } from 'uuid'
import { DialogueTree, DialogueNode, NodeMetadata } from './types'

export class TreeManager {
  private readonly trees: Map<string, DialogueTree> = new Map()

  createTree(title: string): DialogueTree {
    const treeId = uuidv4()
    const rootId = uuidv4()
    const now = Date.now()

    const rootNode: DialogueNode = {
      id: rootId,
      parentId: null,
      role: 'system',
      content: 'Tree created',
      children: [],
      metadata: {
        timestamp: now,
        model: 'system',
      },
    }

    const tree: DialogueTree = {
      id: treeId,
      title,
      rootId,
      activePath: [],
      nodes: { [rootId]: rootNode },
      createdAt: now,
      updatedAt: now,
    }

    this.trees.set(treeId, tree)
    return tree
  }

  addNode(
    treeId: string,
    parentId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata: NodeMetadata
  ): DialogueNode {
    const tree = this.getTreeInternal(treeId)
    const parent = tree.nodes[parentId]

    if (!parent) {
      throw new Error(`Parent node "${parentId}" not found in tree "${treeId}"`)
    }

    const nodeId = uuidv4()
    const node: DialogueNode = {
      id: nodeId,
      parentId,
      role,
      content,
      children: [],
      metadata,
    }

    tree.nodes[nodeId] = node
    tree.nodes[parentId] = {
      ...parent,
      children: [...parent.children, nodeId],
    }

    // Update activePath: build path from root to the new node
    tree.activePath = this.buildPathFromRoot(tree, nodeId)
    tree.updatedAt = Date.now()

    return node
  }

  forkFrom(treeId: string, nodeId: string): DialogueNode {
    const tree = this.getTreeInternal(treeId)
    const node = tree.nodes[nodeId]

    if (!node) {
      throw new Error(`Node "${nodeId}" not found in tree "${treeId}"`)
    }

    const forkId = uuidv4()
    const forkedNode: DialogueNode = {
      id: forkId,
      parentId: nodeId,
      role: 'user',
      content: '',
      children: [],
      metadata: {
        timestamp: Date.now(),
        model: 'system',
      },
    }

    tree.nodes[forkId] = forkedNode
    tree.nodes[nodeId] = {
      ...node,
      children: [...node.children, forkId],
    }

    // Update activePath to go through the fork point to the new child
    tree.activePath = this.buildPathFromRoot(tree, forkId)
    tree.updatedAt = Date.now()

    return forkedNode
  }

  switchBranch(treeId: string, nodeId: string): void {
    const tree = this.getTreeInternal(treeId)
    const node = tree.nodes[nodeId]

    if (!node) {
      throw new Error(`Node "${nodeId}" not found in tree "${treeId}"`)
    }

    // Walk up from nodeId to root to get path from root to nodeId
    const pathUp = this.buildPathFromRoot(tree, nodeId)

    // Walk down from nodeId to deepest leaf following first child
    const pathDown = this.walkDownFirstChild(tree, nodeId)

    // Combine: pathUp already includes nodeId, pathDown starts after nodeId
    tree.activePath = [...pathUp, ...pathDown.slice(1)]
    tree.updatedAt = Date.now()
  }

  deleteBranch(treeId: string, nodeId: string): void {
    const tree = this.getTreeInternal(treeId)

    if (nodeId === tree.rootId) {
      throw new Error('Cannot delete root node')
    }

    const node = tree.nodes[nodeId]
    if (!node) {
      throw new Error(`Node "${nodeId}" not found in tree "${treeId}"`)
    }

    // Collect all descendant IDs (including the node itself)
    const toDelete = this.collectDescendants(tree, nodeId)

    // Remove node from parent's children
    const parent = tree.nodes[node.parentId!]
    if (parent) {
      tree.nodes[node.parentId!] = {
        ...parent,
        children: parent.children.filter((childId) => childId !== nodeId),
      }
    }

    // Delete all collected nodes
    for (const id of toDelete) {
      delete tree.nodes[id]
    }

    // If any deleted node was in the active path, recalculate
    const wasInActivePath = tree.activePath.some((id) => toDelete.has(id))
    if (wasInActivePath) {
      this.recalculateActivePathAfterDelete(tree, node.parentId!)
    }

    tree.updatedAt = Date.now()
  }

  getActivePath(treeId: string): DialogueNode[] {
    const tree = this.getTreeInternal(treeId)
    return tree.activePath
      .map((id) => tree.nodes[id])
      .filter((node): node is DialogueNode => node !== undefined)
  }

  getTree(treeId: string): DialogueTree {
    return this.getTreeInternal(treeId)
  }

  loadTree(tree: DialogueTree): void {
    this.trees.set(tree.id, { ...tree })
  }

  private getTreeInternal(treeId: string): DialogueTree {
    const tree = this.trees.get(treeId)
    if (!tree) {
      throw new Error(`Tree "${treeId}" not found`)
    }
    return tree
  }

  private buildPathFromRoot(tree: DialogueTree, nodeId: string): string[] {
    const path: string[] = []
    let currentId: string | null = nodeId

    while (currentId !== null) {
      path.unshift(currentId)
      const currentNode: DialogueNode | undefined = tree.nodes[currentId]
      if (!currentNode) {
        break
      }
      currentId = currentNode.parentId
    }

    return path
  }

  private walkDownFirstChild(tree: DialogueTree, nodeId: string): string[] {
    const path: string[] = [nodeId]
    let current: DialogueNode | undefined = tree.nodes[nodeId]

    while (current && current.children.length > 0) {
      const firstChildId: string = current.children[0]
      path.push(firstChildId)
      current = tree.nodes[firstChildId]
    }

    return path
  }

  private collectDescendants(tree: DialogueTree, nodeId: string): Set<string> {
    const result = new Set<string>()
    const stack = [nodeId]

    while (stack.length > 0) {
      const id = stack.pop()!
      result.add(id)
      const node = tree.nodes[id]
      if (node) {
        for (const childId of node.children) {
          stack.push(childId)
        }
      }
    }

    return result
  }

  private recalculateActivePathAfterDelete(tree: DialogueTree, parentId: string): void {
    const parent = tree.nodes[parentId]
    if (!parent) {
      tree.activePath = []
      return
    }

    if (parent.children.length > 0) {
      // Switch to the first remaining sibling and walk down
      const siblingId = parent.children[0]
      const pathToParent = this.buildPathFromRoot(tree, parentId)
      const pathDown = this.walkDownFirstChild(tree, siblingId)
      tree.activePath = [...pathToParent, ...pathDown]
    } else {
      // No siblings remain — activePath ends at the parent
      tree.activePath = this.buildPathFromRoot(tree, parentId)
    }
  }
}
