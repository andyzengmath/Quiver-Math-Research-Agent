import * as vscode from 'vscode'
import { LlmService } from '../llm/service'
import { LlmAuthError, LlmMessage } from '../llm/types'
import { PersonaManager } from '../persona/manager'

const PARTICIPANT_ID = 'math-research-agent.math'

export function registerChatParticipant(
  context: vscode.ExtensionContext,
  llmService: LlmService,
  personaManager: PersonaManager
): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    _chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    const config = vscode.workspace.getConfiguration('mathAgent')
    const personaId = config.get<string>('defaultPersona', 'algebraist')

    let systemPrompt: string
    try {
      const persona = personaManager.getPersona(personaId)
      systemPrompt = persona.systemPrompt
    } catch {
      systemPrompt =
        'You are a helpful math research assistant. Help the user explore mathematical ideas, prove theorems, and develop rigorous arguments.'
    }

    let provider
    try {
      provider = llmService.getProvider()
    } catch (error) {
      if (error instanceof LlmAuthError) {
        stream.markdown('No LLM provider is configured.')
        stream.button({
          command: 'mathAgent.configureProvider',
          title: 'Configure LLM',
        })
        return {}
      }
      throw error
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: request.prompt },
    ]

    const chunks = provider.sendMessage(messages, {}, token)

    for await (const chunk of chunks) {
      if (token.isCancellationRequested) {
        break
      }
      stream.markdown(chunk)
    }

    return {}
  }

  const participant = vscode.chat.createChatParticipant(
    PARTICIPANT_ID,
    handler
  )

  participant.iconPath = new vscode.ThemeIcon('symbol-numeric')

  context.subscriptions.push(participant)
}
