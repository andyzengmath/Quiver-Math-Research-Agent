import { Citation } from '../knowledge/types'
import { Lean4Result } from '../lean4/types'

export interface NodeMetadata {
  timestamp: number
  model: string
  persona?: string
  sources?: Citation[]
  lean4Result?: Lean4Result
}

export interface DialogueNode {
  id: string
  parentId: string | null
  role: 'user' | 'assistant' | 'system'
  content: string
  children: string[]
  metadata: NodeMetadata
}

export interface DialogueTree {
  id: string
  title: string
  rootId: string
  activePath: string[]
  nodes: Record<string, DialogueNode>
  createdAt: number
  updatedAt: number
  attachedPapers?: AttachedPaper[]
}

export interface AttachedPaper {
  id: string
  source: 'arxiv' | 'local-pdf' | 'local-tex'
  title: string
  arxivId?: string
  filePath?: string
  extractedText: string
  selectedSections?: string[]
  scope: 'global' | 'branch'
  branchId?: string
}
