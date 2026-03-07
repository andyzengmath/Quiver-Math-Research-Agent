import * as vscode from 'vscode'

export interface TexFileInfo {
  readonly path: string
  readonly name: string
}

export interface TexHeading {
  readonly level: 'section' | 'subsection'
  readonly title: string
  readonly lineNumber: number
}

export interface BibInfo {
  readonly path: string
  readonly type: 'bibliography' | 'bibresource'
}

/**
 * Scan workspace for .tex files using VS Code workspace API.
 */
export async function scanTexFiles(workspaceRoot: string): Promise<ReadonlyArray<TexFileInfo>> {
  const files = await vscode.workspace.findFiles('**/*.tex', '**/node_modules/**')
  return files.map((uri) => {
    const relativePath = vscode.workspace.asRelativePath(uri, false)
    const segments = uri.fsPath.split(/[\\/]/)
    const name = segments[segments.length - 1] ?? relativePath
    return { path: uri.fsPath, name }
  })
}

/**
 * Parse \section{} and \subsection{} headings from .tex content.
 * Returns headings with their line numbers (1-based).
 */
export function parseTexStructure(content: string): ReadonlyArray<TexHeading> {
  if (!content) {
    return []
  }

  const lines = content.split('\n')
  const headings: TexHeading[] = []

  const sectionRegex = /^\\(section|subsection)\{([^}]*)\}/

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    const match = sectionRegex.exec(trimmed)
    if (match) {
      headings.push({
        level: match[1] as 'section' | 'subsection',
        title: match[2],
        lineNumber: i + 1,
      })
    }
  }

  return headings
}

/**
 * Scan .tex content for bibliography/bib file references.
 * Looks for \bibliography{...} and \addbibresource{...} commands.
 */
export function findBibPaths(content: string): ReadonlyArray<BibInfo> {
  if (!content) {
    return []
  }

  const results: BibInfo[] = []
  const lines = content.split('\n')

  const bibRegex = /\\bibliography\{([^}]*)\}/
  const bibresourceRegex = /\\addbibresource\{([^}]*)\}/

  for (const line of lines) {
    const trimmed = line.trimStart()
    const bibMatch = bibRegex.exec(trimmed)
    if (bibMatch) {
      // \bibliography may not include .bib extension
      const path = bibMatch[1].endsWith('.bib') ? bibMatch[1] : `${bibMatch[1]}.bib`
      results.push({ path, type: 'bibliography' })
    }
    const bibresourceMatch = bibresourceRegex.exec(trimmed)
    if (bibresourceMatch) {
      const path = bibresourceMatch[1].endsWith('.bib') ? bibresourceMatch[1] : `${bibresourceMatch[1]}.bib`
      results.push({ path, type: 'bibresource' })
    }
  }

  return results
}
