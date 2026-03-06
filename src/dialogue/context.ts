import { LlmMessage } from '../llm/types'
import { DialogueTree, DialogueNode } from './types'
import { PersonaManager } from '../persona/manager'
import { Citation } from '../knowledge/types'

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful math research assistant. Help the user explore mathematical ideas, prove theorems, and develop rigorous arguments. Provide clear explanations and cite relevant mathematical concepts.'

export interface ContextBuildOptions {
  readonly persona?: string
  readonly ragCitations?: Citation[]
  readonly maxTokens?: number
}

export class ContextBuilder {
  private readonly personaManager: PersonaManager

  constructor(personaManager: PersonaManager) {
    this.personaManager = personaManager
  }

  build(
    tree: DialogueTree,
    nodeId: string,
    options?: ContextBuildOptions
  ): LlmMessage[] {
    const targetNode = tree.nodes[nodeId]
    if (!targetNode) {
      throw new Error(`Node not found in tree: '${nodeId}'`)
    }

    const messages: LlmMessage[] = []

    // 1. System prompt from persona (or default)
    const systemPrompt = this.getSystemPrompt(options?.persona)
    messages.push({ role: 'system', content: systemPrompt })

    // 2. Collect path from root to target node
    const path = this.walkPath(tree, nodeId)

    // 3. Attached papers (global scope or matching branch)
    const paperMessages = this.buildPaperMessages(tree, path)
    for (const paperMsg of paperMessages) {
      messages.push(paperMsg)
    }

    // 4. Path messages (skip root system node)
    const pathMessages = this.buildPathMessages(path)
    for (const pathMsg of pathMessages) {
      messages.push(pathMsg)
    }

    // 5. RAG citations (if provided and non-empty)
    const ragMessages = this.buildRagMessages(options?.ragCitations)
    for (const ragMsg of ragMessages) {
      messages.push(ragMsg)
    }

    return messages
  }

  private getSystemPrompt(personaId?: string): string {
    if (!personaId) {
      return DEFAULT_SYSTEM_PROMPT
    }

    try {
      const persona = this.personaManager.getPersona(personaId)
      return persona.systemPrompt
    } catch {
      return DEFAULT_SYSTEM_PROMPT
    }
  }

  private walkPath(tree: DialogueTree, nodeId: string): DialogueNode[] {
    const path: DialogueNode[] = []
    let currentId: string | null = nodeId

    while (currentId !== null) {
      const node: DialogueNode | undefined = tree.nodes[currentId]
      if (!node) {
        break
      }
      path.push(node)
      currentId = node.parentId
    }

    // Reverse to get root-to-target order
    return path.reverse()
  }

  private buildPaperMessages(
    tree: DialogueTree,
    path: DialogueNode[]
  ): LlmMessage[] {
    const papers = tree.attachedPapers
    if (!papers || papers.length === 0) {
      return []
    }

    const pathNodeIds = new Set(path.map((n) => n.id))

    const relevantPapers = papers.filter((paper) => {
      if (paper.scope === 'global') {
        return true
      }
      if (paper.scope === 'branch' && paper.branchId) {
        return pathNodeIds.has(paper.branchId)
      }
      return false
    })

    if (relevantPapers.length === 0) {
      return []
    }

    return relevantPapers.map((paper) => ({
      role: 'system' as const,
      content: `Attached paper: "${paper.title}"\n\n${paper.extractedText}`,
    }))
  }

  private buildPathMessages(path: DialogueNode[]): LlmMessage[] {
    // Skip root system node (first node in path is typically the root with role 'system')
    return path
      .filter((node) => node.role !== 'system')
      .map((node) => ({
        role: node.role as 'user' | 'assistant',
        content: node.content,
      }))
  }

  private buildRagMessages(citations?: Citation[]): LlmMessage[] {
    if (!citations || citations.length === 0) {
      return []
    }

    const formattedCitations = citations
      .map(
        (c) =>
          `[${c.source}] "${c.title}" (${c.url})\n${c.snippet}`
      )
      .join('\n\n')

    return [
      {
        role: 'system' as const,
        content: `Reference material from sources:\n\n${formattedCitations}`,
      },
    ]
  }
}
