import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerPersonaHandlers(registry: MessageHandlerRegistry): void {
  registry.register('setPersona', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'setPersona') {
      return
    }

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const treeId = tree.id
    const { treeManager, storage } = panel.services

    // Update the tree with the selected persona
    const updatedTree = {
      ...tree,
      activePersona: msg.personaId,
      updatedAt: Date.now(),
    }

    // Update in-memory tree via treeManager
    const currentTree = treeManager.getTree(treeId)
    const patchedTree = {
      ...currentTree,
      activePersona: msg.personaId,
      updatedAt: Date.now(),
    }

    // Store back -- treeManager stores by reference in its Map, so we set it
    panel.setCurrentTree(patchedTree)

    // Persist
    try {
      storage.saveTree(patchedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    // Post updated tree state to webview
    panel.postToWebview({ type: 'treeState', tree: patchedTree })
  })
}
