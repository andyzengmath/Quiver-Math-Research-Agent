import * as vscode from 'vscode'
import { LlmService } from './llm/service'

interface ProviderOption extends vscode.QuickPickItem {
  readonly id: string
}

const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  { label: 'VS Code Copilot', id: 'vscode-lm' },
  { label: 'OpenAI (GPT-5.4)', id: 'openai' },
  { label: 'Anthropic (Claude Opus 4.6)', id: 'anthropic' },
  { label: 'Google (Gemini 3.1 Pro)', id: 'google' },
]

const SECRET_KEY_MAP: Readonly<Record<string, string>> = {
  openai: 'openai',
  anthropic: 'anthropic-api-key',
  google: 'google-api-key',
}

/**
 * Runs the first-run onboarding wizard that guides users through
 * selecting an LLM provider, entering an API key, and testing the connection.
 *
 * @returns true if onboarding completed successfully, false otherwise
 */
export async function runOnboardingWizard(
  llmService: LlmService,
  context: vscode.ExtensionContext
): Promise<boolean> {
  // Step 1: Choose provider
  const chosen = await vscode.window.showQuickPick(
    PROVIDER_OPTIONS as ProviderOption[],
    {
      placeHolder: 'Choose your LLM provider',
      title: 'Math Research Agent — Setup',
      ignoreFocusOut: true,
    }
  )

  if (!chosen) {
    return false
  }

  // Step 2: Enter API key (if not vscode-lm)
  if (chosen.id !== 'vscode-lm') {
    const secretKey = SECRET_KEY_MAP[chosen.id]
    if (!secretKey) {
      await vscode.window.showErrorMessage(
        `Unknown provider: ${chosen.id}`
      )
      return false
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: `Enter your ${chosen.label} API key`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-...',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty'
        }
        return undefined
      },
    })

    if (!apiKey) {
      return false
    }

    await llmService.setApiKey(secretKey, apiKey.trim())
  }

  // Step 3: Test connection
  try {
    llmService.setProvider(chosen.id)

    const tokenSource = new vscode.CancellationTokenSource()
    try {
      const stream = llmService.sendMessage(
        [{ role: 'user', content: 'Hello' }],
        { maxTokens: 16 },
        tokenSource.token
      )

      // Collect at least the first chunk to verify the connection works
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _chunk of stream) {
        break
      }
    } finally {
      tokenSource.dispose()
    }

    // Success: update config and mark onboarding complete
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    await config.update('provider', chosen.id, vscode.ConfigurationTarget.Global)
    await context.globalState.update('mathAgent.onboardingComplete', true)
    await vscode.window.showInformationMessage('Math Research Agent is ready!')
    return true
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const action = await vscode.window.showErrorMessage(
      `Connection test failed: ${errorMessage}`,
      'Try again',
      'Skip'
    )

    if (action === 'Try again') {
      return runOnboardingWizard(llmService, context)
    }

    // Skip: mark onboarding complete so wizard doesn't re-launch,
    // but don't change provider config
    if (action === 'Skip') {
      await context.globalState.update('mathAgent.onboardingComplete', true)
    }

    return false
  }
}
