import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerBranchHandlers(registry: MessageHandlerRegistry): void {
  registry.register('deleteBranch', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'deleteBranch') {
      return
    }

    const { treeManager, storage } = panel.services
    const treeId = panel.getCurrentTreeId()

    if (!treeId) {
      return
    }

    try {
      treeManager.deleteBranch(treeId, msg.nodeId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[branch-handler] deleteBranch failed: ${errorMessage}`)
      return
    }

    const updatedTree = treeManager.getTree(treeId)
    panel.setCurrentTree(updatedTree)

    try {
      storage.saveTree(updatedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: updatedTree })
  })
}
