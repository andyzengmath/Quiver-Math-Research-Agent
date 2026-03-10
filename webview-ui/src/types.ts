/**
 * Mirrors the dialogue tree types from the extension host side.
 * Kept lightweight for the webview bundle.
 */

export interface NodeMetadata {
  readonly timestamp: number
  readonly model: string
  readonly persona?: string
  readonly incomplete?: boolean
}

export interface DialogueNode {
  readonly id: string
  readonly parentId: string | null
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
  readonly children: ReadonlyArray<string>
  readonly metadata: NodeMetadata
}

export interface AttachedPaper {
  readonly id: string
  readonly source: 'arxiv' | 'local-pdf' | 'local-tex'
  readonly title: string
  readonly arxivId?: string
  readonly filePath?: string
  readonly extractedText: string
  readonly selectedSections?: ReadonlyArray<string>
  readonly scope: 'global' | 'branch'
  readonly branchId?: string
}

export interface DialogueTree {
  readonly id: string
  readonly title: string
  readonly rootId: string
  readonly activePath: ReadonlyArray<string>
  readonly nodes: Readonly<Record<string, DialogueNode>>
  readonly activePersona?: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly attachedPapers?: ReadonlyArray<AttachedPaper>
}

export interface PersonaConfig {
  readonly id: string
  readonly label: string
  readonly systemPrompt: string
  readonly preferredSources?: ReadonlyArray<string>
}

export interface RagCitation {
  readonly source: string
  readonly title: string
  readonly snippet: string
  readonly url: string
}

export interface RagStatus {
  readonly state: 'searching' | 'found' | 'none' | 'error'
  readonly citations?: ReadonlyArray<RagCitation>
}

export interface ProviderInfo {
  readonly id: string
  readonly model: string
  readonly label?: string
}

export interface TreeListItem {
  readonly id: string
  readonly title: string
  readonly updatedAt: number
}

export interface TexFile {
  readonly path: string
  readonly name: string
}

export interface TexStructureItem {
  readonly level: number
  readonly title: string
  readonly line: number
}

export interface Lean4Result {
  readonly status: 'success' | 'error' | 'timeout'
  readonly leanCode: string
  readonly diagnostics: ReadonlyArray<string>
  readonly verifiedAt: number
}

/**
 * Messages sent from the extension host to the webview.
 */
export type HostToWebview =
  | { readonly type: 'treeState'; readonly tree: DialogueTree }
  | { readonly type: 'streamChunk'; readonly nodeId: string; readonly text: string }
  | { readonly type: 'streamEnd'; readonly nodeId: string }
  | { readonly type: 'ragStatus'; readonly nodeId: string; readonly status: RagStatus }
  | { readonly type: 'personas'; readonly personas: ReadonlyArray<PersonaConfig> }
  | { readonly type: 'providers'; readonly providers: ReadonlyArray<ProviderInfo> }
  | { readonly type: 'multiAgentResult'; readonly responses: ReadonlyArray<{ readonly personaId: string; readonly label: string; readonly response: string }>; readonly synthesis: string }
  | { readonly type: 'lean4Result'; readonly nodeId: string; readonly result: Lean4Result }
  | { readonly type: 'treeList'; readonly trees: ReadonlyArray<TreeListItem> }
  | { readonly type: 'texFiles'; readonly files: ReadonlyArray<TexFile> }
  | { readonly type: 'texStructure'; readonly structure: ReadonlyArray<TexStructureItem> }
  | { readonly type: 'draftResult'; readonly latex: string }
  | { readonly type: 'lean4Available'; readonly available: boolean }

/**
 * Messages sent from the webview to the extension host.
 */
export type WebviewToHost =
  | { readonly type: 'send'; readonly content: string; readonly nodeId?: string }
  | { readonly type: 'fork'; readonly nodeId: string }
  | { readonly type: 'deleteBranch'; readonly nodeId: string }
  | { readonly type: 'switchBranch'; readonly nodeId: string }
  | { readonly type: 'stopStream' }
  | { readonly type: 'setPersona'; readonly personaId: string }
  | { readonly type: 'setModel'; readonly provider: string; readonly model: string }
  | { readonly type: 'requestState' }
  | { readonly type: 'addPaper' }
  | { readonly type: 'removePaper'; readonly paperId: string }
  | { readonly type: 'setPaperScope'; readonly paperId: string; readonly scope: 'global' | 'branch' }
  | { readonly type: 'verifyLean4'; readonly nodeId: string }
  | { readonly type: 'retryLean4'; readonly nodeId: string; readonly attempt: number }
  | { readonly type: 'getTexFiles' }
  | { readonly type: 'selectTexFile'; readonly filePath: string }
  | { readonly type: 'draftFromBranch'; readonly branchNodeId: string }
  | { readonly type: 'insertIntoFile'; readonly filePath: string; readonly afterLine: number; readonly content: string }
  | { readonly type: 'listTrees' }
  | { readonly type: 'selectTree'; readonly treeId: string }
  | { readonly type: 'createTree'; readonly title: string }
  | { readonly type: 'renameTree'; readonly treeId: string; readonly title: string }
  | { readonly type: 'deleteTree'; readonly treeId: string }
  | { readonly type: 'setRagEnabled'; readonly enabled: boolean }
  | { readonly type: 'openUrl'; readonly url: string }
