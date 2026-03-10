import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import { PdfExtractionError } from '../../papers/manager'
import type { AttachedPaper } from '../../dialogue/types'

export function registerPaperHandler(registry: MessageHandlerRegistry): void {
  registry.register('addPaper', async (_msg: WebviewToHost, panel: MathResearchPanel) => {
    const tree = panel.getCurrentTree()
    if (!tree) {
      void vscode.window.showWarningMessage('No active research session. Send a message first.')
      return
    }

    // Show QuickPick: From file or From arXiv
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'From file (.tex)', value: 'file' as const },
        { label: 'From arXiv ID', value: 'arxiv' as const },
      ],
      { placeHolder: 'How would you like to add a paper?' }
    )

    if (!choice) {
      return
    }

    let paper: AttachedPaper | undefined

    if (choice.value === 'file') {
      paper = await handleFileAttachment(panel)
    } else {
      paper = await handleArxivAttachment(panel)
    }

    if (!paper) {
      return
    }

    // Add paper to the tree's attachedPapers array
    const { treeManager, storage } = panel.services
    const treeId = tree.id
    const currentTree = treeManager.getTree(treeId)
    const existingPapers = currentTree.attachedPapers ?? []

    const updatedTree = {
      ...currentTree,
      attachedPapers: [...existingPapers, paper],
      updatedAt: Date.now(),
    }

    panel.setCurrentTree(updatedTree)

    try {
      storage.saveTree(updatedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: updatedTree })
  })

  registry.register('removePaper', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'removePaper') {
      return
    }

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const { treeManager, storage } = panel.services
    const treeId = tree.id
    const currentTree = treeManager.getTree(treeId)
    const existingPapers = currentTree.attachedPapers ?? []

    const updatedTree = {
      ...currentTree,
      attachedPapers: existingPapers.filter((p) => p.id !== msg.paperId),
      updatedAt: Date.now(),
    }

    panel.setCurrentTree(updatedTree)

    try {
      storage.saveTree(updatedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: updatedTree })
  })

  registry.register('setPaperScope', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'setPaperScope') {
      return
    }

    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const { treeManager, storage } = panel.services
    const treeId = tree.id
    const currentTree = treeManager.getTree(treeId)
    const existingPapers = currentTree.attachedPapers ?? []

    const updatedTree = {
      ...currentTree,
      attachedPapers: existingPapers.map((p) =>
        p.id === msg.paperId ? { ...p, scope: msg.scope } : p
      ),
      updatedAt: Date.now(),
    }

    panel.setCurrentTree(updatedTree)

    try {
      storage.saveTree(updatedTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: updatedTree })
  })
}

async function handleFileAttachment(
  panel: MathResearchPanel
): Promise<AttachedPaper | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
      'TeX files': ['tex'],
    },
    title: 'Select a paper to attach',
  })

  if (!uris || uris.length === 0) {
    return undefined
  }

  const filePath = uris[0].fsPath

  try {
    return await panel.services.paperManager.attachFromFile(filePath)
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      void vscode.window.showErrorMessage(
        `PDF extraction failed: ${error.message}`
      )
    } else {
      const errorMsg = error instanceof Error ? error.message : String(error)
      void vscode.window.showErrorMessage(
        `Failed to attach paper: ${errorMsg}`
      )
    }
    return undefined
  }
}

async function handleArxivAttachment(
  panel: MathResearchPanel
): Promise<AttachedPaper | undefined> {
  const arxivId = await vscode.window.showInputBox({
    placeHolder: 'e.g. 2301.12345',
    prompt: 'Enter the arXiv paper ID',
    validateInput: (value) => {
      if (!value.trim()) {
        return 'arXiv ID cannot be empty'
      }
      return undefined
    },
  })

  if (!arxivId) {
    return undefined
  }

  const { arxivClient } = panel.services

  try {
    return await panel.services.paperManager.attachFromArxiv(arxivId, arxivClient)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    void vscode.window.showErrorMessage(
      `Failed to fetch paper from arXiv: ${errorMsg}`
    )
    return undefined
  }
}
