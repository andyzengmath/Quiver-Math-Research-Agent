import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerBranchHandler(registry: MessageHandlerRegistry): void {
  registry.register('switchBranch', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'switchBranch') {
      return
    }

    const { treeManager, storage } = panel.services

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const treeId = tree.id

    try {
      treeManager.switchBranch(treeId, msg.nodeId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[branch-handler] switchBranch failed: ${errorMessage}`)
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

  registry.register('fork', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'fork') {
      return
    }

    const { treeManager, storage } = panel.services

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const treeId = tree.id

    try {
      treeManager.forkFrom(treeId, msg.nodeId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.warn(`[branch-handler] fork failed: ${errorMessage}`)
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

  registry.register('deleteBranch', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'deleteBranch') {
      return
    }

    const { treeManager, storage } = panel.services

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const treeId = tree.id

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
