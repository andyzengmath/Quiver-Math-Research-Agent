import * as fs from 'fs'
import * as path from 'path'
import { DialogueTree } from './types'

export class CorruptTreeError extends Error {
  readonly treeId: string

  constructor(treeId: string, message?: string) {
    super(message ?? `Corrupt tree file for tree: ${treeId}`)
    this.name = 'CorruptTreeError'
    this.treeId = treeId
  }
}

export interface TreeListEntry {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
}

export class StorageService {
  private readonly workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  private getTreeDir(): string {
    return path.join(this.workspaceRoot, '.math-agent', 'trees')
  }

  saveTree(tree: DialogueTree): void {
    const treeDir = this.getTreeDir()
    fs.mkdirSync(treeDir, { recursive: true })

    const filePath = path.join(treeDir, `${tree.id}.json`)
    const backupPath = path.join(treeDir, `${tree.id}.backup.json`)

    // If the file already exists, copy it to backup before overwriting
    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, backupPath)
    }

    fs.writeFileSync(filePath, JSON.stringify(tree, null, 2), 'utf-8')

    this.ensureGitignore()
  }

  loadTree(treeId: string): DialogueTree {
    const filePath = path.join(this.getTreeDir(), `${treeId}.json`)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Tree file not found: ${treeId}`)
    }

    const content = fs.readFileSync(filePath, 'utf-8')

    try {
      const parsed = JSON.parse(content) as DialogueTree
      return parsed
    } catch {
      throw new CorruptTreeError(treeId)
    }
  }

  listTrees(): TreeListEntry[] {
    const treeDir = this.getTreeDir()

    if (!fs.existsSync(treeDir)) {
      return []
    }

    const files = fs.readdirSync(treeDir)
    const entries: TreeListEntry[] = []

    for (const file of files) {
      // Only process .json files, skip .backup.json files
      if (!file.endsWith('.json') || file.endsWith('.backup.json')) {
        continue
      }

      const filePath = path.join(treeDir, file)
      try {
        const content = fs.readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(content)
        entries.push({
          id: parsed.id,
          title: parsed.title,
          updatedAt: parsed.updatedAt,
        })
      } catch {
        // Skip files that fail to parse
        continue
      }
    }

    return entries
  }

  deleteTree(treeId: string): void {
    const treeDir = this.getTreeDir()
    const filePath = path.join(treeDir, `${treeId}.json`)
    const backupPath = path.join(treeDir, `${treeId}.backup.json`)

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath)
    }
  }

  renameTree(treeId: string, title: string): void {
    const tree = this.loadTree(treeId)
    const updatedTree: DialogueTree = {
      ...tree,
      title,
      updatedAt: Date.now(),
    }
    this.saveTree(updatedTree)
  }

  ensureGitignore(): void {
    const gitignorePath = path.join(this.workspaceRoot, '.gitignore')

    if (!fs.existsSync(gitignorePath)) {
      return
    }

    const content = fs.readFileSync(gitignorePath, 'utf-8')

    if (!content.includes('.math-agent/')) {
      const separator = content.endsWith('\n') ? '' : '\n'
      fs.writeFileSync(
        gitignorePath,
        content + separator + '.math-agent/\n',
        'utf-8'
      )
    }
  }
}
