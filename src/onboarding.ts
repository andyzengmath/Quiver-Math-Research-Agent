import * as vscode from 'vscode'
import { LlmService } from './llm/service'
import { listAzureDeployments, AzureAuth } from './llm/azure-deployments'

interface ProviderOption extends vscode.QuickPickItem {
  readonly id: string
}

const PROVIDER_OPTIONS: readonly ProviderOption[] = [
  { label: 'VS Code Copilot', id: 'vscode-lm' },
  { label: 'OpenAI (GPT-5.4)', id: 'openai' },
  { label: 'Anthropic (Claude Opus 4.6)', id: 'anthropic' },
  { label: 'Google (Gemini 3.1 Pro)', id: 'google' },
  { label: 'Azure OpenAI', id: 'azure-openai' },
]

const SECRET_KEY_MAP: Readonly<Record<string, string>> = {
  openai: 'openai',
  anthropic: 'anthropic-api-key',
  google: 'google-api-key',
  'azure-openai': 'azure-openai-api-key',
}

const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview'

interface AzureOnboardingResult {
  readonly endpoint: string
  readonly deployment: string
  readonly authMethod: 'api-key' | 'managed-identity'
}

/**
 * Runs the Azure OpenAI-specific onboarding sub-flow.
 *
 * Collects endpoint URL, auth method, credentials, and deployment name.
 * Returns the gathered configuration or undefined if user cancelled at any step.
 */
async function runAzureOnboardingFlow(
  llmService: LlmService
): Promise<AzureOnboardingResult | undefined> {
  // Step A1: Enter endpoint URL
  const endpoint = await vscode.window.showInputBox({
    prompt: 'Enter your Azure OpenAI endpoint URL',
    ignoreFocusOut: true,
    placeHolder: 'https://my-resource.openai.azure.com/',
    validateInput: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Endpoint URL cannot be empty'
      }
      if (!value.trim().startsWith('https://')) {
        return 'Endpoint URL must start with https://'
      }
      return undefined
    },
  })

  if (!endpoint) {
    return undefined
  }

  const trimmedEndpoint = endpoint.trim()

  // Step A2: Choose auth method
  const authOptions: readonly vscode.QuickPickItem[] = [
    { label: 'API Key' },
    { label: 'Managed Identity (Microsoft Entra)' },
  ]

  const authChoice = await vscode.window.showQuickPick(
    authOptions as vscode.QuickPickItem[],
    {
      placeHolder: 'Choose authentication method',
      title: 'Azure OpenAI — Authentication',
      ignoreFocusOut: true,
    }
  )

  if (!authChoice) {
    return undefined
  }

  const isApiKey = authChoice.label === 'API Key'
  const authMethod: 'api-key' | 'managed-identity' = isApiKey
    ? 'api-key'
    : 'managed-identity'

  // Step A3: Collect credentials based on auth method
  let auth: AzureAuth | undefined

  if (isApiKey) {
    // Step A3a: Prompt for API key
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Azure OpenAI API key',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'Enter API key...',
      validateInput: (value: string) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty'
        }
        return undefined
      },
    })

    if (!apiKey) {
      return undefined
    }

    const secretKey = SECRET_KEY_MAP['azure-openai']
    await llmService.setApiKey(secretKey, apiKey.trim())
    auth = { type: 'api-key', apiKey: apiKey.trim() }
  } else {
    // Step A3b: Managed Identity info message
    await vscode.window.showInformationMessage(
      'Azure Managed Identity will use DefaultAzureCredential. ' +
      'This chains through environment variables, managed identity (Azure VMs), ' +
      'Azure CLI (az login), and falls back to browser-based OAuth login.'
    )

    // For deployment discovery with managed identity, we attempt to get a token.
    // If this fails, deployment listing will fall back to manual input.
    let token: string | undefined
    try {
      // @azure/identity is bundled by esbuild but only loaded when managed identity is selected.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const identityModule = require('@azure/identity') as {
        DefaultAzureCredential: new () => {
          getToken(scope: string): Promise<{ token: string }>
        }
      }
      const credential = new identityModule.DefaultAzureCredential()
      const tokenResponse = await credential.getToken(
        'https://cognitiveservices.azure.com/.default'
      )
      token = tokenResponse.token
    } catch {
      // Token acquisition failed; deployment listing will use manual fallback
    }

    if (token) {
      auth = { type: 'bearer', token }
    }
  }

  // Step A4: Auto-discover deployments
  // Skip discovery if no auth is available (managed identity token acquisition failed)
  const deployment = auth
    ? await pickAzureDeployment(trimmedEndpoint, auth)
    : await promptManualDeployment()

  if (!deployment) {
    return undefined
  }

  return {
    endpoint: trimmedEndpoint,
    deployment,
    authMethod,
  }
}

/**
 * Fetches available Azure OpenAI deployments and presents a QuickPick.
 * Falls back to manual text input if auto-discovery fails or returns empty.
 *
 * @returns The selected deployment name, or undefined if cancelled.
 */
async function pickAzureDeployment(
  endpoint: string,
  auth: AzureAuth
): Promise<string | undefined> {
  const deployments = await listAzureDeployments(
    endpoint,
    auth,
    DEFAULT_AZURE_API_VERSION
  )

  if (deployments.length > 0) {
    // Show QuickPick with deployment info
    const items: readonly (vscode.QuickPickItem & { readonly deploymentName: string })[] =
      deployments.map(d => ({
        label: `${d.name} (${d.model}) -- ${d.status}`,
        deploymentName: d.name,
      }))

    const picked = await vscode.window.showQuickPick(
      items as (vscode.QuickPickItem & { readonly deploymentName: string })[],
      {
        placeHolder: 'Select a deployment',
        title: 'Azure OpenAI — Deployment',
        ignoreFocusOut: true,
      }
    )

    if (!picked) {
      return undefined
    }

    return picked.deploymentName
  }

  // Fallback: manual input when auto-discovery fails or returns empty
  const manualDeployment = await vscode.window.showInputBox({
    prompt: 'Could not list deployments. Enter the deployment name manually.',
    ignoreFocusOut: true,
    placeHolder: 'e.g. gpt-5-4-deployment',
    validateInput: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Deployment name cannot be empty'
      }
      return undefined
    },
  })

  if (!manualDeployment) {
    return undefined
  }

  return manualDeployment.trim()
}

/**
 * Prompts for manual deployment name input when auto-discovery is unavailable.
 */
async function promptManualDeployment(): Promise<string | undefined> {
  const deployment = await vscode.window.showInputBox({
    prompt: 'Enter the Azure OpenAI deployment name.',
    ignoreFocusOut: true,
    placeHolder: 'e.g. gpt-5-4-deployment',
    validateInput: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'Deployment name cannot be empty'
      }
      return undefined
    },
  })
  return deployment?.trim()
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

  // Step 2: Provider-specific setup
  let azureResult: AzureOnboardingResult | undefined

  if (chosen.id === 'azure-openai') {
    // Azure OpenAI has its own multi-step flow
    azureResult = await runAzureOnboardingFlow(llmService)

    if (!azureResult) {
      return false
    }

    // Save Azure-specific settings before testing connection
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    await config.update('azureEndpoint', azureResult.endpoint, vscode.ConfigurationTarget.Global)
    await config.update('azureDeployment', azureResult.deployment, vscode.ConfigurationTarget.Global)
    await config.update('azureAuthMethod', azureResult.authMethod, vscode.ConfigurationTarget.Global)
    await config.update('azureApiVersion', DEFAULT_AZURE_API_VERSION, vscode.ConfigurationTarget.Global)
  } else if (chosen.id !== 'vscode-lm') {
    // Standard provider: enter API key
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
