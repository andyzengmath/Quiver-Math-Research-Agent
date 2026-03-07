import * as vscode from 'vscode'
import { PersonaManager } from '../persona/manager'
import { ContextBuilder } from '../dialogue/context'
import { LlmService } from '../llm/service'
import { DialogueTree } from '../dialogue/types'

export interface IndividualResponse {
  readonly personaId: string
  readonly label: string
  readonly response: string
}

export interface MultiAgentResult {
  readonly individualResponses: ReadonlyArray<IndividualResponse>
  readonly synthesis: string
}

/**
 * Collects the full text from an async iterable of string chunks.
 */
async function collectStream(
  stream: AsyncIterable<string>,
  token: vscode.CancellationToken
): Promise<string> {
  let result = ''
  for await (const chunk of stream) {
    if (token.isCancellationRequested) {
      break
    }
    result += chunk
  }
  return result
}

/**
 * Runs a multi-agent orchestration: sends the user prompt to multiple personas
 * in parallel, collects their responses, then synthesizes them into a single answer.
 */
export async function runMultiAgent(
  prompt: string,
  personaIds: ReadonlyArray<string>,
  personaManager: PersonaManager,
  contextBuilder: ContextBuilder,
  llmService: LlmService,
  tree: DialogueTree,
  nodeId: string,
  token: vscode.CancellationToken
): Promise<MultiAgentResult> {
  // Get LLM configuration
  const config = vscode.workspace.getConfiguration('mathAgent.llm')
  const provider = config.get<string>('provider', 'openai')
  const modelKey = `${provider}Model`
  const model = config.get<string>(modelKey, '')

  // Ensure the active provider is set
  try {
    llmService.setProvider(provider)
  } catch {
    // Provider may not be registered; proceed anyway
  }

  // Run each persona in parallel using Promise.allSettled
  const personaPromises = personaIds.map(async (personaId) => {
    const persona = personaManager.getPersona(personaId)
    const messages = contextBuilder.build(tree, nodeId, { persona: personaId })
    const stream = llmService.sendMessage(messages, { model }, token)
    const response = await collectStream(stream, token)
    return {
      personaId,
      label: persona.label,
      response,
    }
  })

  const settledResults = await Promise.allSettled(personaPromises)

  const individualResponses: IndividualResponse[] = []
  for (const result of settledResults) {
    if (result.status === 'fulfilled') {
      individualResponses.push(result.value)
    } else {
      // Include failed personas with an error message
      individualResponses.push({
        personaId: 'unknown',
        label: 'Error',
        response: `[Error: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}]`,
      })
    }
  }

  // Build synthesis prompt combining all responses
  const perspectiveBlocks = individualResponses
    .map((r) => `[${r.label}]: ${r.response}`)
    .join('\n\n')

  const synthesisPrompt =
    `Here are perspectives from multiple mathematical experts:\n\n${perspectiveBlocks}\n\n` +
    'Synthesize these perspectives into a comprehensive answer. ' +
    'Highlight agreements, resolve contradictions, and present a unified mathematical analysis.'

  const synthesisMessages = contextBuilder.build(tree, nodeId, {})
  // Replace the last user message content with the synthesis prompt
  const synthesisContext = [
    ...synthesisMessages.slice(0, -1),
    { role: 'user' as const, content: synthesisPrompt },
  ]

  const synthesisStream = llmService.sendMessage(
    synthesisContext,
    { model },
    token
  )
  const synthesis = await collectStream(synthesisStream, token)

  return { individualResponses, synthesis }
}

/**
 * Reads the configured multi-agent persona list from settings.
 * Falls back to default personas: algebraist, analyst, geometer.
 */
export function getMultiAgentPersonaIds(): ReadonlyArray<string> {
  const config = vscode.workspace.getConfiguration('mathAgent.multiAgent')
  const personas = config.get<string[]>('personas', [
    'algebraist',
    'analyst',
    'geometer',
  ])
  return personas
}
