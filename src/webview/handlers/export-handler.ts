import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import { exportToMarkdown } from '../../export/markdown'
import { exportToHtml } from '../../export/html'
import type { DialogueTree } from '../../dialogue/types'

type ExportMode = 'active-branch' | 'full-tree' | 'from-node'

/**
 * Counts the number of root-to-leaf branches in a dialogue tree.
 */
function countBranches(tree: DialogueTree): number {
  let count = 0

  function walk(nodeId: string): void {
    const node = tree.nodes[nodeId]
    if (!node) {
      return
    }
    if (node.children.length === 0) {
      count += 1
    } else {
      for (const childId of node.children) {
        walk(childId)
      }
    }
  }

  walk(tree.rootId)
  return count
}

/**
 * Performs the export-to-Markdown flow: generate content, show save dialog, write file.
 */
async function handleExportMarkdown(
  tree: DialogueTree,
  mode: ExportMode,
  fromNodeId?: string
): Promise<void> {
  const content = exportToMarkdown(tree, { mode, fromNodeId })

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${tree.title}.md`),
    filters: { 'Markdown': ['md'] },
  })

  if (!uri) {
    return
  }

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
  void vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`)
}

/**
 * Performs the export-to-HTML flow: generate content, show save dialog, write file.
 */
async function handleExportHtml(
  tree: DialogueTree,
  mode: ExportMode,
  fromNodeId?: string
): Promise<void> {
  const content = exportToHtml(tree, { mode, fromNodeId })

  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${tree.title}.html`),
    filters: { 'HTML': ['html'] },
  })

  if (!uri) {
    return
  }

  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'))
  void vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`)
}

/**
 * Checks whether a full-tree export with more than 10 branches should proceed.
 * Returns true if the user confirms, or if the tree has 10 or fewer branches.
 */
async function confirmLargeExport(tree: DialogueTree, mode: ExportMode): Promise<boolean> {
  if (mode !== 'full-tree') {
    return true
  }

  const branchCount = countBranches(tree)
  if (branchCount <= 10) {
    return true
  }

  const choice = await vscode.window.showWarningMessage(
    `This tree has ${branchCount} branches. The export may be very long. Continue?`,
    { modal: true },
    'Continue'
  )

  return choice === 'Continue'
}

export function registerExportHandlers(registry: MessageHandlerRegistry): void {
  registry.register('exportMarkdown', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'exportMarkdown') {
      return
    }

    const tree = panel.getCurrentTree()
    if (!tree) {
      void vscode.window.showWarningMessage('No active research session to export.')
      return
    }

    const confirmed = await confirmLargeExport(tree, msg.mode)
    if (!confirmed) {
      return
    }

    try {
      await handleExportMarkdown(tree, msg.mode, msg.fromNodeId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      void vscode.window.showErrorMessage(`Export failed: ${errorMessage}`)
    }
  })

  registry.register('exportHtml', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'exportHtml') {
      return
    }

    const tree = panel.getCurrentTree()
    if (!tree) {
      void vscode.window.showWarningMessage('No active research session to export.')
      return
    }

    const confirmed = await confirmLargeExport(tree, msg.mode)
    if (!confirmed) {
      return
    }

    try {
      await handleExportHtml(tree, msg.mode, msg.fromNodeId)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      void vscode.window.showErrorMessage(`Export failed: ${errorMessage}`)
    }
  })

  registry.register('showExportMenu', async (_msg: WebviewToHost, panel: MathResearchPanel) => {
    const tree = panel.getCurrentTree()
    if (!tree) {
      void vscode.window.showWarningMessage('No active research session to export.')
      return
    }

    const options: ReadonlyArray<vscode.QuickPickItem & { readonly exportMode: ExportMode; readonly format: 'markdown' | 'html' }> = [
      { label: 'Export Active Branch as Markdown', exportMode: 'active-branch', format: 'markdown' },
      { label: 'Export Active Branch as HTML', exportMode: 'active-branch', format: 'html' },
      { label: 'Export Full Tree as Markdown', exportMode: 'full-tree', format: 'markdown' },
      { label: 'Export Full Tree as HTML', exportMode: 'full-tree', format: 'html' },
    ]

    const picked = await vscode.window.showQuickPick(options, {
      placeHolder: 'Choose export format and scope',
    })

    if (!picked) {
      return
    }

    const confirmed = await confirmLargeExport(tree, picked.exportMode)
    if (!confirmed) {
      return
    }

    try {
      if (picked.format === 'markdown') {
        await handleExportMarkdown(tree, picked.exportMode)
      } else {
        await handleExportHtml(tree, picked.exportMode)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      void vscode.window.showErrorMessage(`Export failed: ${errorMessage}`)
    }
  })
}
