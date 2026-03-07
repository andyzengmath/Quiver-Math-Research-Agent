import * as vscode from 'vscode'
import { VscodeLmProvider } from './llm/providers/vscode-lm'
import { createServices } from './services'
import { MathResearchPanel } from './webview/panel'
import { registerChatParticipant } from './chat/participant'
import { runOnboardingWizard } from './onboarding'

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

  // Register command to (re-)configure provider at any time
  const configureProviderCommand = vscode.commands.registerCommand(
    'mathAgent.configureProvider',
    () => runOnboardingWizard(services.llm, context)
  )

  context.subscriptions.push(openPanelCommand, configureProviderCommand)

  // Register the @math chat participant with slash commands
  registerChatParticipant(context, {
    llmService: services.llm,
    personaManager: services.personaManager,
    contextBuilder: services.contextBuilder,
    ragOrchestrator: services.ragOrchestrator,
    arxivClient: services.arxivClient,
  })

  // Launch onboarding wizard on first activation if no provider is configured.
  const onboardingComplete = context.globalState.get<boolean>('mathAgent.onboardingComplete')
  const providerInspect = vscode.workspace
    .getConfiguration('mathAgent.llm')
    .inspect<string>('provider')
  const hasUserConfiguredProvider =
    providerInspect?.globalValue !== undefined ||
    providerInspect?.workspaceValue !== undefined ||
    providerInspect?.workspaceFolderValue !== undefined

  if (!onboardingComplete && !hasUserConfiguredProvider) {
    void runOnboardingWizard(services.llm, context)
  }
}

export function deactivate(): void {
  // cleanup
}
