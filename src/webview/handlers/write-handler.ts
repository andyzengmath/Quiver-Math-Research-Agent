import * as path from 'path'
import * as fs from 'fs'
import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import { scanTexFiles, parseTexStructure, findBibPaths } from '../../papers/tex-parser'
import type { LlmMessage } from '../../llm/types'

const DRAFT_SYSTEM_PROMPT =
  'You are a LaTeX writing assistant for mathematical research papers. ' +
  'Draft a LaTeX section based on the provided research discussion. ' +
  'Include theorem/proof environments and \\cite{} references for any cited sources. ' +
  'Output only the LaTeX content.'

const WRITE_CHAT_SYSTEM_PROMPT =
  'You are a LaTeX writing assistant. The user is working on the following .tex document. ' +
  'Help them draft, edit, or improve LaTeX content. ' +
  'Output only the LaTeX content unless the user asks a question.'

export function registerWriteHandlers(registry: MessageHandlerRegistry): void {
  // Handler: getTexFiles
  registry.register('getTexFiles', async (_msg: WebviewToHost, panel: MathResearchPanel) => {
    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      panel.postToWebview({ type: 'texFiles', files: [] })
      return
    }

    try {
      const files = await scanTexFiles(workspaceFolders[0].uri.fsPath)
      panel.postToWebview({ type: 'texFiles', files })
    } catch {
      panel.postToWebview({ type: 'texFiles', files: [] })
    }
  })

  // Handler: selectTexFile
  registry.register('selectTexFile', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'selectTexFile') {
      return
    }

    try {
      const uri = vscode.Uri.file(msg.filePath)
      const contentBytes = await vscode.workspace.fs.readFile(uri)
      const content = Buffer.from(contentBytes).toString('utf-8')
      const headings = parseTexStructure(content)

      const structure = headings.map((h) => ({
        level: h.level === 'section' ? 1 : 2,
        title: h.title,
        line: h.lineNumber,
      }))

      panel.postToWebview({ type: 'texStructure', structure })
    } catch {
      panel.postToWebview({ type: 'texStructure', structure: [] })
    }
  })

  // Handler: draftFromBranch
  registry.register('draftFromBranch', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'draftFromBranch') {
      return
    }

    const { llm, contextBuilder } = panel.services
    const tree = panel.getCurrentTree()

    const messages: LlmMessage[] = []
    messages.push({ role: 'system', content: DRAFT_SYSTEM_PROMPT })

    // Try to build context from the branch node if a tree is available
    if (tree && tree.nodes[msg.branchNodeId]) {
      const contextMessages = contextBuilder.build(tree, msg.branchNodeId)
      // Skip the system prompt from contextBuilder (index 0), use the rest as context
      for (let i = 1; i < contextMessages.length; i++) {
        messages.push(contextMessages[i])
      }
      messages.push({
        role: 'user',
        content: 'Based on the above research discussion, draft a LaTeX section with appropriate theorem/proof environments.',
      })
    } else {
      // If no tree context, use the branchNodeId as a topic
      messages.push({
        role: 'user',
        content: `Draft a LaTeX section about: ${msg.branchNodeId}`,
      })
    }

    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const provider = config.get<string>('provider', 'openai')
    const modelKey = `${provider}Model`
    const model = config.get<string>(modelKey, '')

    try {
      llm.setProvider(provider)
    } catch {
      // Provider may not be registered
    }

    const cts = new vscode.CancellationTokenSource()
    let fullText = ''

    try {
      const stream = llm.sendMessage(messages, { model }, cts.token)
      for await (const chunk of stream) {
        fullText += chunk
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      fullText = `% Error generating draft: ${errorMessage}`
    } finally {
      cts.dispose()
    }

    panel.postToWebview({ type: 'draftResult', latex: fullText })
  })

  // Handler: insertIntoFile
  registry.register('insertIntoFile', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'insertIntoFile') {
      return
    }

    try {
      // Validate file path is within a workspace folder (prevent path traversal)
      const workspaceFolders = vscode.workspace.workspaceFolders
      if (!workspaceFolders) {
        void vscode.window.showErrorMessage('No workspace folder open.')
        return
      }
      const resolved = path.resolve(msg.filePath)
      const inWorkspace = workspaceFolders.some(f =>
        resolved.startsWith(f.uri.fsPath)
      )
      if (!inWorkspace) {
        void vscode.window.showErrorMessage('File path must be within the workspace.')
        return
      }

      const uri = vscode.Uri.file(msg.filePath)
      const position = new vscode.Position(msg.afterLine, 0)

      const edit = new vscode.WorkspaceEdit()
      edit.insert(uri, position, `\n${msg.content}\n`)
      await vscode.workspace.applyEdit(edit)

      // Check for BibTeX entries to append
      const bibEntriesAdded = await appendBibTexEntries(msg.content, msg.filePath)

      const fileName = path.basename(msg.filePath)
      const bibMessage = bibEntriesAdded > 0
        ? ` ${bibEntriesAdded} new BibTeX entries added.`
        : ''
      void vscode.window.showInformationMessage(
        `Content inserted into ${fileName} at line ${msg.afterLine}.${bibMessage}`
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      void vscode.window.showErrorMessage(`Failed to insert content: ${errorMessage}`)
    }
  })

  // Handler: writeChat (write-tab chat with document context)
  registry.register('writeChat', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    // writeChat is not in the WebviewToHost union yet, but handle gracefully
    // The chat input in the Write tab reuses draftFromBranch for now
    if (msg.type !== 'draftFromBranch') {
      return
    }
  })
}

/**
 * Extract \cite{key} references from LaTeX content and find corresponding
 * BibTeX entries. Append new entries to the .bib file if found.
 */
async function appendBibTexEntries(
  latexContent: string,
  texFilePath: string
): Promise<number> {
  // Extract cite keys from the inserted content
  const citeRegex = /\\cite\{([^}]+)\}/g
  const citeKeys = new Set<string>()
  let match: RegExpExecArray | null

  match = citeRegex.exec(latexContent)
  while (match !== null) {
    // Split comma-separated keys: \cite{key1,key2}
    const keys = match[1].split(',').map((k) => k.trim()).filter(Boolean)
    for (const key of keys) {
      citeKeys.add(key)
    }
    match = citeRegex.exec(latexContent)
  }

  if (citeKeys.size === 0) {
    return 0
  }

  // Find the .bib file from the .tex file
  const texDir = path.dirname(texFilePath)
  let bibFilePath: string | null = null

  try {
    const texContent = fs.readFileSync(texFilePath, 'utf-8')
    const bibPaths = findBibPaths(texContent)
    if (bibPaths.length > 0) {
      bibFilePath = path.resolve(texDir, bibPaths[0].path)
    }
  } catch {
    // Could not read tex file to find bib path
  }

  // Fallback: look for any .bib file in the workspace
  if (!bibFilePath) {
    const bibFiles = await vscode.workspace.findFiles('**/*.bib', '**/node_modules/**', 1)
    if (bibFiles.length > 0) {
      bibFilePath = bibFiles[0].fsPath
    }
  }

  if (!bibFilePath) {
    return 0
  }

  // Read existing bib entries to avoid duplicates
  let existingBib = ''
  try {
    existingBib = fs.readFileSync(bibFilePath, 'utf-8')
  } catch {
    // File might not exist yet - that's OK, we'll create it
  }

  // Parse existing citation keys
  const existingKeys = new Set<string>()
  const entryRegex = /@\w+\{([^,]+),/g
  let entryMatch = entryRegex.exec(existingBib)
  while (entryMatch !== null) {
    existingKeys.add(entryMatch[1].trim())
    entryMatch = entryRegex.exec(existingBib)
  }

  // Find new keys that are not already in the .bib file
  const newKeys: string[] = []
  for (const key of citeKeys) {
    if (!existingKeys.has(key)) {
      newKeys.push(key)
    }
  }

  if (newKeys.length === 0) {
    return 0
  }

  // Generate placeholder BibTeX entries for new keys
  const newEntries = newKeys.map((key) =>
    `@article{${key},\n  title = {TODO: Fill in title for ${key}},\n  author = {TODO},\n  year = {TODO},\n}\n`
  ).join('\n')

  // Append to bib file
  try {
    const uri = vscode.Uri.file(bibFilePath)
    const edit = new vscode.WorkspaceEdit()

    if (existingBib) {
      // Append to end of existing file
      const lines = existingBib.split('\n')
      const lastLine = lines.length
      const position = new vscode.Position(lastLine, 0)
      edit.insert(uri, position, `\n${newEntries}`)
    } else {
      // Create new file content
      edit.createFile(uri, { ignoreIfExists: true })
      edit.insert(uri, new vscode.Position(0, 0), newEntries)
    }

    await vscode.workspace.applyEdit(edit)
    return newKeys.length
  } catch {
    return 0
  }
}
