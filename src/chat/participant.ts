import * as vscode from 'vscode'
import { LlmService } from '../llm/service'
import { PersonaManager } from '../persona/manager'
import { ContextBuilder } from '../dialogue/context'
import { RagOrchestrator } from '../knowledge/rag-orchestrator'
import { ArxivClient } from '../knowledge/arxiv'
import { Citation } from '../knowledge/types'

/**
 * Dependencies required by the chat participant.
 */
export interface ChatParticipantDeps {
  readonly llmService: LlmService
  readonly personaManager: PersonaManager
  readonly contextBuilder: ContextBuilder
  readonly ragOrchestrator: RagOrchestrator
  readonly arxivClient: ArxivClient
}

/**
 * Formats an array of citations as a markdown table.
 */
function formatCitationsAsMarkdown(citations: ReadonlyArray<Citation>): string {
  if (citations.length === 0) {
    return 'No results found.'
  }

  const header = '| Title | Source | Snippet | URL |\n| --- | --- | --- | --- |'
  const rows = citations.map((c) => {
    const title = c.title.replace(/\|/g, '\\|')
    const snippet = c.snippet.substring(0, 120).replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const url = c.url
    return `| ${title} | ${c.source} | ${snippet} | [Link](${url}) |`
  })

  return `${header}\n${rows.join('\n')}`
}

/**
 * Formats arXiv citations with BibTeX in code blocks.
 */
function formatArxivResults(citations: ReadonlyArray<Citation>): string {
  if (citations.length === 0) {
    return 'No arXiv papers found.'
  }

  const entries = citations.map((c) => {
    const lines = [
      `### ${c.title}`,
      '',
      c.snippet.substring(0, 300),
      '',
      `[View on arXiv](${c.url})`,
    ]

    if (c.bibtex) {
      lines.push('', '```bibtex', c.bibtex, '```')
    }

    return lines.join('\n')
  })

  return entries.join('\n\n---\n\n')
}

/**
 * Handles the /search slash command.
 * Calls the RAG orchestrator to enrich the query with citations from all sources.
 */
async function handleSearchCommand(
  query: string,
  stream: vscode.ChatResponseStream,
  ragOrchestrator: RagOrchestrator
): Promise<void> {
  stream.markdown('Searching arXiv, Wikipedia, and nLab...\n\n')

  const ragStatus = await ragOrchestrator.enrich(query)
  const markdown = formatCitationsAsMarkdown(ragStatus.citations)
  stream.markdown(markdown)
}

/**
 * Handles the /arxiv slash command.
 * Searches arXiv directly and formats results with BibTeX.
 */
async function handleArxivCommand(
  query: string,
  stream: vscode.ChatResponseStream,
  arxivClient: ArxivClient
): Promise<void> {
  stream.markdown('Searching arXiv...\n\n')

  const citations = await arxivClient.search(query)
  const markdown = formatArxivResults(citations)
  stream.markdown(markdown)
}

/**
 * Handles the /studio slash command.
 * Opens the Math Research Studio panel.
 */
async function handleStudioCommand(
  stream: vscode.ChatResponseStream
): Promise<void> {
  await vscode.commands.executeCommand('mathAgent.openPanel')
  stream.markdown('Opening Math Research Studio...')
}

/**
 * Gets the default persona system prompt from configuration.
 */
function getDefaultSystemPrompt(personaManager: PersonaManager): string {
  const defaultFallback =
    'You are a helpful math research assistant. Help the user explore mathematical ideas, prove theorems, and develop rigorous arguments.'

  try {
    const config = vscode.workspace.getConfiguration('mathAgent')
    const defaultPersonaId = config.get<string>('defaultPersona', 'algebraist')
    const persona = personaManager.getPersona(defaultPersonaId)
    return persona.systemPrompt
  } catch {
    return defaultFallback
  }
}

/**
 * Default chat handler: streams LLM response with persona system prompt.
 */
async function handleDefaultChat(
  request: vscode.ChatRequest,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
  llmService: LlmService,
  personaManager: PersonaManager
): Promise<void> {
  try {
    const systemPrompt = getDefaultSystemPrompt(personaManager)
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: request.prompt },
    ]

    for await (const chunk of llmService.sendMessage(messages, {}, token)) {
      stream.markdown(chunk)
    }
  } catch {
    stream.markdown('No LLM provider configured. Please configure a provider to use the math assistant.')
    stream.button({
      command: 'mathAgent.configureProvider',
      title: 'Configure LLM',
    })
  }
}

/**
 * Registers the @math chat participant with VS Code's Copilot Chat API.
 * Handles slash commands: /search, /arxiv, /studio.
 * Falls through to default LLM-based chat for unrecognized commands.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  deps: ChatParticipantDeps
): void {
  const { llmService, personaManager, ragOrchestrator, arxivClient } = deps

  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    switch (request.command) {
      case 'search':
        await handleSearchCommand(request.prompt, stream, ragOrchestrator)
        break

      case 'arxiv':
        await handleArxivCommand(request.prompt, stream, arxivClient)
        break

      case 'studio':
        await handleStudioCommand(stream)
        break

      default:
        await handleDefaultChat(request, stream, token, llmService, personaManager)
        break
    }

    return {}
  }

  const participant = vscode.chat.createChatParticipant(
    'math-research-agent.math',
    handler
  )

  participant.iconPath = new vscode.ThemeIcon('symbol-operator')

  context.subscriptions.push(participant)
}
