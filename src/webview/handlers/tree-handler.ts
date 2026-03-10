import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerTreeHandler(registry: MessageHandlerRegistry): void {
  registry.register('listTrees', async (_msg: WebviewToHost, panel: MathResearchPanel) => {
    const { storage } = panel.services

    try {
      const entries = storage.listTrees()
      panel.postToWebview({
        type: 'treeList',
        trees: entries.map((e) => ({
          id: e.id,
          title: e.title,
          updatedAt: e.updatedAt,
        })),
      })
    } catch {
      // listTrees failed silently
      panel.postToWebview({ type: 'treeList', trees: [] })
    }
  })

  registry.register('selectTree', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'selectTree') {
      return
    }

    const { storage, treeManager } = panel.services

    try {
      const tree = storage.loadTree(msg.treeId)
      treeManager.loadTree(tree)
      panel.setCurrentTree(tree)
      panel.postToWebview({ type: 'treeState', tree })
    } catch {
      // selectTree failed silently
    }
  })

  registry.register('createTree', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'createTree') {
      return
    }

    const { treeManager, storage } = panel.services

    const tree = treeManager.createTree(msg.title)
    panel.setCurrentTree(tree)

    try {
      storage.saveTree(tree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree })

    // Also send updated tree list
    try {
      const entries = storage.listTrees()
      panel.postToWebview({
        type: 'treeList',
        trees: entries.map((e) => ({
          id: e.id,
          title: e.title,
          updatedAt: e.updatedAt,
        })),
      })
    } catch {
      // Ignore list errors after create
    }
  })

  registry.register('renameTree', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'renameTree') {
      return
    }

    const { storage } = panel.services

    try {
      storage.renameTree(msg.treeId, msg.title)

      // If this is the current tree, update in-memory state
      const currentTree = panel.getCurrentTree()
      if (currentTree && currentTree.id === msg.treeId) {
        const updatedTree = {
          ...currentTree,
          title: msg.title,
          updatedAt: Date.now(),
        }
        panel.setCurrentTree(updatedTree)
        panel.postToWebview({ type: 'treeState', tree: updatedTree })
      }

      // Send updated tree list
      const entries = storage.listTrees()
      panel.postToWebview({
        type: 'treeList',
        trees: entries.map((e) => ({
          id: e.id,
          title: e.title,
          updatedAt: e.updatedAt,
        })),
      })
    } catch {
      // renameTree failed silently
    }
  })

  registry.register('deleteTree', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'deleteTree') {
      return
    }

    const { storage } = panel.services

    try {
      storage.deleteTree(msg.treeId)

      // If the deleted tree is the current tree, clear it
      const currentTree = panel.getCurrentTree()
      if (currentTree && currentTree.id === msg.treeId) {
        panel.clearCurrentTree()
      }

      // Send updated tree list
      const entries = storage.listTrees()
      panel.postToWebview({
        type: 'treeList',
        trees: entries.map((e) => ({
          id: e.id,
          title: e.title,
          updatedAt: e.updatedAt,
        })),
      })
    } catch {
      // deleteTree failed silently
    }
  })
}
