import * as vscode from 'vscode'
import { VscodeLmProvider } from './llm/providers/vscode-lm'
import { AzureOpenAiProvider } from './llm/providers/azure-openai'
import { createServices } from './services'
import { MathResearchPanel } from './webview/panel'
import { registerChatParticipant } from './chat/participant'
import { runOnboardingWizard } from './onboarding'

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Math Research Agent')
  outputChannel.appendLine('Math Research Agent: activating...')

  try {
    const services = createServices(context)
    outputChannel.appendLine('Math Research Agent: services created')

    // Register the VS Code Language Model API provider (Copilot)
    const vscodeLmProvider = new VscodeLmProvider()
    services.llm.registerProvider(vscodeLmProvider)

    // Register Azure OpenAI provider (supports api-key and managed-identity auth)
    const azureOpenAiProvider = new AzureOpenAiProvider(services.llm)
    services.llm.registerProvider(azureOpenAiProvider)

    // Restore active provider from user settings for returning users
    const configuredProvider = vscode.workspace
      .getConfiguration('mathAgent.llm')
      .get<string>('provider')
    if (configuredProvider) {
      try {
        services.llm.setProvider(configuredProvider)
      } catch {
        // Provider not registered; user will be prompted via onboarding
      }
    }

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

    outputChannel.appendLine('Math Research Agent: commands registered, registering chat participant...')

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

    outputChannel.appendLine('Math Research Agent: chat participant registered')

    if (!onboardingComplete && !hasUserConfiguredProvider) {
      void runOnboardingWizard(services.llm, context)
    }

    outputChannel.appendLine('Math Research Agent: activation complete')
  } catch (error) {
    outputChannel.appendLine(`Math Research Agent: activation FAILED - ${error}`)
    const msg = error instanceof Error ? error.message : String(error)
    vscode.window.showErrorMessage(`Math Research Agent failed to activate: ${msg}`)
    throw error
  }
}

export function deactivate(): void {
  // cleanup
}
