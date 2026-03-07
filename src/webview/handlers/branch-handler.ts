import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerBranchHandlers(registry: MessageHandlerRegistry): void {
  registry.register('fork', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'fork') {
      return
    }

    const { treeManager, storage } = panel.services
    const treeId = panel.getCurrentTreeId()

    if (!treeId) {
      return
    }

    // Fork from the specified node
    treeManager.forkFrom(treeId, msg.nodeId)

    // Get the updated tree
    const tree = treeManager.getTree(treeId)
    panel.setCurrentTree(tree)

    // Save to storage
    try {
      storage.saveTree(tree)
    } catch {
      // Storage errors should not crash the handler
    }

    // Post updated tree state to webview
    panel.postToWebview({ type: 'treeState', tree })
  })

  registry.register('switchBranch', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'switchBranch') {
      return
    }

    const { treeManager, storage } = panel.services
    const treeId = panel.getCurrentTreeId()

    if (!treeId) {
      return
    }

    // Switch the active path to go through the specified node
    treeManager.switchBranch(treeId, msg.nodeId)

    // Get the updated tree
    const tree = treeManager.getTree(treeId)
    panel.setCurrentTree(tree)

    // Save to storage
    try {
      storage.saveTree(tree)
    } catch {
      // Storage errors should not crash the handler
    }

    // Post updated tree state to webview
    panel.postToWebview({ type: 'treeState', tree })
  })
}
