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
    } catch {
      // switchBranch failed silently
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
    } catch {
      // fork failed silently
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
    } catch {
      // deleteBranch failed silently
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

  registry.register('forkAndSend', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'forkAndSend') {
      return
    }

    const { treeManager, storage } = panel.services

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const treeId = tree.id

    // First, fork from the specified node
    try {
      treeManager.forkFrom(treeId, msg.nodeId)
    } catch {
      // fork failed silently
      return
    }

    const forkedTree = treeManager.getTree(treeId)
    panel.setCurrentTree(forkedTree)

    try {
      storage.saveTree(forkedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: forkedTree })

    // Then, send the content as a new message by delegating to the send handler
    await panel.registry.handle({ type: 'send', content: msg.content }, panel)
  })
}
