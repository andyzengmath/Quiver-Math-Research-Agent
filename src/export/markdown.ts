import { DialogueTree, DialogueNode } from '../dialogue/types'

export type ExportMode = 'active-branch' | 'full-tree' | 'from-node'

export interface ExportOptions {
  readonly mode: ExportMode
  readonly fromNodeId?: string
}

/**
 * Builds the markdown header block for a research session export.
 */
function buildHeader(tree: DialogueTree): string {
  const lines: string[] = []
  lines.push(`# Research Session: ${tree.title}`)
  lines.push('')

  const date = new Date(tree.createdAt).toISOString().split('T')[0]
  lines.push(`Date: ${date}`)

  if (tree.activePersona) {
    lines.push(`Persona: ${tree.activePersona}`)
  }

  // Collect unique models from non-system nodes
  const models = new Set<string>()
  for (const nodeId of Object.keys(tree.nodes)) {
    const node = tree.nodes[nodeId]
    if (node.role !== 'system' && node.metadata.model) {
      models.add(node.metadata.model)
    }
  }
  if (models.size > 0) {
    lines.push(`Model: ${[...models].join(', ')}`)
  }

  lines.push('')
  return lines.join('\n')
}

/**
 * Formats a single dialogue node as a markdown block.
 * System nodes are skipped (returns empty string).
 */
function formatNode(node: DialogueNode): string {
  if (node.role === 'system') {
    return ''
  }

  const lines: string[] = []
  const roleLabel = node.role === 'user' ? 'User' : 'Assistant'
  lines.push(`**${roleLabel}:** ${node.content}`)

  // Render citations as blockquote if present
  const sources = node.metadata.sources
  if (sources && sources.length > 0) {
    const citationLinks = sources.map(s => `[${s.title}](${s.url})`)
    lines.push('')
    lines.push(`> Sources: ${citationLinks.join(', ')}`)
  }

  return lines.join('\n')
}

/**
 * Exports messages along tree.activePath, skipping system nodes.
 */
function exportActiveBranch(tree: DialogueTree): string {
  const parts: string[] = [buildHeader(tree)]

  const path = tree.activePath
  if (path.length === 0) {
    return parts.join('')
  }

  const messageParts: string[] = []
  for (const nodeId of path) {
    const node = tree.nodes[nodeId]
    if (!node || node.role === 'system') {
      continue
    }
    const formatted = formatNode(node)
    if (formatted) {
      messageParts.push(formatted)
    }
  }

  parts.push(messageParts.join('\n\n---\n\n'))
  parts.push('\n')

  return parts.join('')
}

/**
 * Collects all root-to-leaf paths in the tree.
 * Each path is an array of node IDs from root to a leaf node.
 */
function collectBranches(tree: DialogueTree): string[][] {
  const branches: string[][] = []

  function walk(nodeId: string, currentPath: string[]): void {
    const node = tree.nodes[nodeId]
    if (!node) {
      return
    }
    const nextPath = [...currentPath, nodeId]
    if (node.children.length === 0) {
      branches.push(nextPath)
    } else {
      for (const childId of node.children) {
        walk(childId, nextPath)
      }
    }
  }

  walk(tree.rootId, [])
  return branches
}

/**
 * Finds all node IDs that are branch points (have more than one child).
 * Returns a map from nodeId to sibling count.
 */
function findBranchPoints(tree: DialogueTree): Map<string, number> {
  const points = new Map<string, number>()
  for (const nodeId of Object.keys(tree.nodes)) {
    const node = tree.nodes[nodeId]
    if (node.children.length > 1) {
      points.set(nodeId, node.children.length)
    }
  }
  return points
}

/**
 * Exports all branches of the tree using ## Branch N headings.
 * Warns if more than 10 branches.
 */
function exportFullTree(tree: DialogueTree): string {
  const parts: string[] = [buildHeader(tree)]
  const branches = collectBranches(tree)
  const branchPoints = findBranchPoints(tree)

  if (branches.length > 10) {
    parts.push(`> **Warning:** This tree has ${branches.length} branches. The export may be long.\n\n`)
  }

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i]
    parts.push(`## Branch ${i + 1}\n\n`)

    const messageParts: string[] = []
    for (const nodeId of branch) {
      const node = tree.nodes[nodeId]
      if (!node || node.role === 'system') {
        continue
      }

      // Annotate branch points before rendering the node
      if (branchPoints.has(nodeId)) {
        const siblingCount = branchPoints.get(nodeId)!
        messageParts.push(`<!-- Branch: ${siblingCount} siblings -->`)
      }

      const formatted = formatNode(node)
      if (formatted) {
        messageParts.push(formatted)
      }
    }

    parts.push(messageParts.join('\n\n---\n\n'))
    parts.push('\n\n')
  }

  return parts.join('')
}

/**
 * Exports from a specified node down to the first leaf, following first-child path.
 */
function exportFromNode(tree: DialogueTree, fromNodeId: string): string {
  const parts: string[] = [buildHeader(tree)]

  const startNode = tree.nodes[fromNodeId]
  if (!startNode) {
    return parts.join('')
  }

  const activeSet = new Set(tree.activePath)
  const messageParts: string[] = []
  let currentId: string | undefined = fromNodeId

  while (currentId) {
    const node: DialogueNode | undefined = tree.nodes[currentId]
    if (!node) {
      break
    }

    if (node.role !== 'system') {
      const formatted = formatNode(node)
      if (formatted) {
        messageParts.push(formatted)
      }
    }

    // Follow active branch path if possible, otherwise first child
    currentId = node.children.length > 0
      ? (node.children.find(c => activeSet.has(c)) ?? node.children[0])
      : undefined
  }

  parts.push(messageParts.join('\n\n---\n\n'))
  parts.push('\n')

  return parts.join('')
}

/**
 * Exports a DialogueTree to Markdown format.
 *
 * Modes:
 * - 'active-branch': exports messages along tree.activePath
 * - 'full-tree': exports all branches with ## Branch N headings
 * - 'from-node': exports from a specified node down to the first leaf
 *
 * LaTeX is preserved as-is ($...$ and $$...$$).
 * Citations are rendered as blockquote: > Sources: [title](url), ...
 * Branch points are annotated with <!-- Branch: N siblings --> comments.
 */
export function exportToMarkdown(tree: DialogueTree, options: ExportOptions): string {
  const mode = options.mode || 'active-branch'

  switch (mode) {
    case 'full-tree':
      return exportFullTree(tree)
    case 'from-node':
      return exportFromNode(tree, options.fromNodeId ?? '')
    case 'active-branch':
    default:
      return exportActiveBranch(tree)
  }
}
