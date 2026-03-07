import * as vscode from 'vscode'
import { VscodeLmProvider } from './llm/providers/vscode-lm'
import { createServices } from './services'
import { MathResearchPanel } from './webview/panel'
import { registerChatParticipant } from './chat/participant'

export function activate(context: vscode.ExtensionContext): void {
  const services = createServices(context)

  // Register the VS Code Language Model API provider (Copilot)
  const vscodeLmProvider = new VscodeLmProvider()
  services.llm.registerProvider(vscodeLmProvider)

  const openPanelCommand = vscode.commands.registerCommand(
    'mathAgent.openPanel',
    () => {
      MathResearchPanel.createOrShow(context, services)
    }
  )

  context.subscriptions.push(openPanelCommand)

  // Register the @math chat participant
  registerChatParticipant(context, services.llm, services.personaManager)
}

export function deactivate(): void {
  // cleanup
}
