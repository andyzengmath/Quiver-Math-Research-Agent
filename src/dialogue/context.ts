import { LlmMessage } from '../llm/types'
import { DialogueTree, DialogueNode } from './types'
import { PersonaManager } from '../persona/manager'
import { Citation } from '../knowledge/types'

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful math research assistant. Help the user explore mathematical ideas, prove theorems, and develop rigorous arguments. Provide clear explanations and cite relevant mathematical concepts.'

const SUMMARY_PLACEHOLDER =
  '[Earlier context summarized — see memory file]'

export interface ContextBuildOptions {
  readonly persona?: string
  readonly ragCitations?: Citation[]
  readonly maxTokens?: number
}

export interface TrimmingOptions extends ContextBuildOptions {
  readonly summarizer?: (messages: LlmMessage[]) => Promise<string>
  readonly writeMemoryFile?: (treeId: string, content: string) => Promise<void>
}

export class ContextBuilder {
  private readonly personaManager: PersonaManager

  constructor(personaManager: PersonaManager) {
    this.personaManager = personaManager
  }

  /**
   * Estimates token count for a list of messages using chars/4 approximation.
   */
  estimateTokens(messages: LlmMessage[]): number {
    const totalChars = messages.reduce(
      (sum, msg) => sum + msg.content.length,
      0
    )
    return Math.floor(totalChars / 4)
  }

  /**
   * Builds context messages with trimming support.
   * When maxTokens is set and context exceeds the budget:
   *   1. RAG messages are removed first
   *   2. Oldest path messages are replaced with a summary placeholder
   *   3. Attached paper messages are never removed
   * When trimming occurs, a memory file is written via writeMemoryFile.
   */
  async buildWithTrimming(
    tree: DialogueTree,
    nodeId: string,
    options?: TrimmingOptions
  ): Promise<LlmMessage[]> {
    const targetNode = tree.nodes[nodeId]
    if (!targetNode) {
      throw new Error(`Node not found in tree: '${nodeId}'`)
    }

    // Assemble all messages using the same logic as build()
    const systemPrompt = this.getSystemPrompt(options?.persona)
    const systemMessage: LlmMessage = { role: 'system', content: systemPrompt }

    const path = this.walkPath(tree, nodeId)
    const paperMessages = this.buildPaperMessages(tree, path)
    const pathMessages = this.buildPathMessages(path)
    const ragMessages = this.buildRagMessages(options?.ragCitations)

    // If no maxTokens, return all messages without trimming
    if (!options?.maxTokens) {
      return [systemMessage, ...paperMessages, ...pathMessages, ...ragMessages]
    }

    const maxTokens = options.maxTokens

    // Start with all messages
    let currentMessages = [systemMessage, ...paperMessages, ...pathMessages, ...ragMessages]

    // Check if trimming is needed
    if (this.estimateTokens(currentMessages) <= maxTokens) {
      return currentMessages
    }

    // Phase 1: Remove RAG messages first
    let trimmedMessages: LlmMessage[] = []
    const hasRag = ragMessages.length > 0
    if (hasRag) {
      currentMessages = [systemMessage, ...paperMessages, ...pathMessages]
      trimmedMessages = [...ragMessages]
    }

    if (this.estimateTokens(currentMessages) <= maxTokens) {
      // RAG removal was sufficient - still write memory if we trimmed
      if (trimmedMessages.length > 0 && options.summarizer && options.writeMemoryFile) {
        const memoryContent = await this.formatMemoryFile(
          trimmedMessages,
          options.summarizer
        )
        await options.writeMemoryFile(tree.id, memoryContent)
      }
      return currentMessages
    }

    // Phase 2: Summarize oldest path messages
    // System prompt + paper messages are protected and never removed
    const availablePathMessages = [...pathMessages]

    // Remove oldest path messages one by one until under budget
    const removedPathMessages: LlmMessage[] = []
    while (
      availablePathMessages.length > 1 &&
      this.estimateTokens([
        systemMessage,
        ...paperMessages,
        { role: 'system', content: SUMMARY_PLACEHOLDER },
        ...availablePathMessages,
      ]) > maxTokens
    ) {
      const removed = availablePathMessages.shift()
      if (removed) {
        removedPathMessages.push(removed)
      }
    }

    // Build the trimmed context
    const allTrimmedMessages = [...trimmedMessages, ...removedPathMessages]

    if (removedPathMessages.length > 0) {
      currentMessages = [
        systemMessage,
        ...paperMessages,
        { role: 'system', content: SUMMARY_PLACEHOLDER },
        ...availablePathMessages,
      ]
    }

    // Write memory file if we trimmed anything
    if (allTrimmedMessages.length > 0 && options.summarizer && options.writeMemoryFile) {
      const memoryContent = await this.formatMemoryFile(
        allTrimmedMessages,
        options.summarizer
      )
      await options.writeMemoryFile(tree.id, memoryContent)
    }

    return currentMessages
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

  /**
   * Formats memory file content with Part 1 (LLM summary) and Part 2 (full transcript).
   */
  private async formatMemoryFile(
    trimmedMessages: LlmMessage[],
    summarizer: (messages: LlmMessage[]) => Promise<string>
  ): Promise<string> {
    const summary = await summarizer(trimmedMessages)

    const transcript = trimmedMessages
      .map((msg) => `[${msg.role}]: ${msg.content}`)
      .join('\n\n')

    return [
      '# Context Trim Memory File',
      '',
      '## Part 1: Summary',
      '',
      summary,
      '',
      '## Part 2: Full Transcript',
      '',
      transcript,
    ].join('\n')
  }
}
