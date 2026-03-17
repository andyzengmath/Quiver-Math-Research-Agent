import * as vscode from 'vscode'
import { Services } from '../services'
import { DialogueTree } from '../dialogue/types'
import { HostToWebview, WebviewToHost } from './protocol'
import { MessageHandlerRegistry } from './message-handler'
import { registerSendHandler } from './handlers/send-handler'
import { registerBranchHandler } from './handlers/branch-handler'
import { registerPaperHandler } from './handlers/paper-handler'
import { registerLean4Handlers } from './handlers/lean4-handler'
import { registerModelHandler } from './handlers/model-handler'
import { registerTreeHandler } from './handlers/tree-handler'
import { registerPersonaHandlers } from './handlers/persona-handler'
import { registerWriteHandlers } from './handlers/write-handler'
import { registerExportHandlers } from './handlers/export-handler'

export class MathResearchPanel {
  public static readonly viewType = 'mathAgent.researchPanel'

  private static currentPanel: MathResearchPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly extensionUri: vscode.Uri
  private disposables: vscode.Disposable[] = []

  public readonly services: Services
  public readonly registry: MessageHandlerRegistry

  private currentTreeId: string | null = null
  private currentTree: DialogueTree | null = null
  private activeCancellation: vscode.CancellationTokenSource | null = null

  public static createOrShow(context: vscode.ExtensionContext, services: Services): void {
    const column = vscode.ViewColumn.Beside

    if (MathResearchPanel.currentPanel) {
      MathResearchPanel.currentPanel.panel.reveal(column)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      MathResearchPanel.viewType,
      'Math Research Studio',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(context.extensionUri, 'media'),
        ],
      }
    )

    MathResearchPanel.currentPanel = new MathResearchPanel(panel, context.extensionUri, services)
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    services: Services
  ) {
    this.panel = panel
    this.extensionUri = extensionUri
    this.services = services
    this.registry = new MessageHandlerRegistry()

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)

    // Wire up message handling from webview
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToHost) => {
        void this.registry.handle(msg, this)
      },
      null,
      this.disposables
    )

    // Register built-in handlers
    this.registerBuiltInHandlers()

    // Register feature handlers
    registerSendHandler(this.registry)
    registerBranchHandler(this.registry)
    registerPaperHandler(this.registry)
    registerLean4Handlers(this.registry)
    registerModelHandler(this.registry)
    registerTreeHandler(this.registry)
    registerPersonaHandlers(this.registry)
    registerWriteHandlers(this.registry)
    registerExportHandlers(this.registry)
  }

  private registerBuiltInHandlers(): void {
    this.registry.register('requestState', async (_msg, panel) => {
      // Post current tree state
      const tree = panel.getCurrentTree()
      if (tree) {
        panel.postToWebview({ type: 'treeState', tree })
      }

      // Post personas
      const personas = panel.services.personaManager.listPersonas()
      panel.postToWebview({ type: 'personas', personas })

      // Post providers: build list from registered providers with configured models
      const providerConfigs: Array<{ id: string; model: string; label: string }> = []
      const llmConfig = vscode.workspace.getConfiguration('mathAgent.llm')

      const providerDefs: ReadonlyArray<{ id: string; modelKey: string; label: string }> = [
        { id: 'openai', modelKey: 'openaiModel', label: 'OpenAI' },
        { id: 'anthropic', modelKey: 'anthropicModel', label: 'Anthropic' },
        { id: 'google', modelKey: 'googleModel', label: 'Google' },
      ]

      for (const def of providerDefs) {
        try {
          panel.services.llm.getProvider(def.id)
          const model = llmConfig.get<string>(def.modelKey, '')
          providerConfigs.push({ id: def.id, model, label: def.label })
        } catch {
          // Provider not registered, skip
        }
      }

      // Azure OpenAI: only include when both endpoint and deployment are configured
      const azureEndpoint = llmConfig.get<string>('azureEndpoint', '')
      const azureDeployment = llmConfig.get<string>('azureDeployment', '')
      if (azureEndpoint && azureDeployment) {
        try {
          panel.services.llm.getProvider('azure-openai')
          providerConfigs.push({
            id: 'azure-openai',
            model: azureDeployment,
            label: 'Azure OpenAI',
          })
        } catch {
          // Provider not registered, skip
        }
      }

      panel.postToWebview({ type: 'providers', providers: providerConfigs })

      // Post lean4 availability
      const lean4Enabled = vscode.workspace
        .getConfiguration('mathAgent.lean4')
        .get<boolean>('enabled', false)
      if (lean4Enabled) {
        try {
          const available = await panel.services.lean4.isAvailable()
          panel.postToWebview({ type: 'lean4Available', available })
        } catch {
          panel.postToWebview({ type: 'lean4Available', available: false })
        }
      } else {
        panel.postToWebview({ type: 'lean4Available', available: false })
      }
    })

    this.registry.register('stopStream', async (_msg, panel) => {
      panel.cancelActiveStream()
    })

    this.registry.register('setRagEnabled', async (msg, _panel) => {
      if (msg.type !== 'setRagEnabled') {
        return
      }
      const config = vscode.workspace.getConfiguration('mathAgent.rag')
      await config.update('enabled', msg.enabled, vscode.ConfigurationTarget.Global)
    })

    this.registry.register('openUrl', async (msg, _panel) => {
      if (msg.type !== 'openUrl') {
        return
      }
      const uri = vscode.Uri.parse(msg.url)
      if (uri.scheme !== 'https' && uri.scheme !== 'http') {
        return
      }
      await vscode.env.openExternal(uri)
    })

    this.registry.register('setReasoningEffort', async (msg, _panel) => {
      if (msg.type !== 'setReasoningEffort') {
        return
      }
      const config = vscode.workspace.getConfiguration('mathAgent.llm')
      await config.update('reasoningEffort', msg.effort, vscode.ConfigurationTarget.Global)
    })
  }

  public postToWebview(msg: HostToWebview): void {
    void this.panel.webview.postMessage(msg)
  }

  public getCurrentTree(): DialogueTree | null {
    return this.currentTree
  }

  public getCurrentTreeId(): string | null {
    return this.currentTreeId
  }

  public setCurrentTree(tree: DialogueTree): void {
    this.currentTree = tree
    this.currentTreeId = tree.id
  }

  public clearCurrentTree(): void {
    this.currentTree = null
    this.currentTreeId = null
  }

  public setActiveCancellation(cts: vscode.CancellationTokenSource): void {
    this.activeCancellation = cts
  }

  public cancelActiveStream(): void {
    if (this.activeCancellation) {
      this.activeCancellation.cancel()
      this.activeCancellation.dispose()
      this.activeCancellation = null
    }
  }

  private dispose(): void {
    MathResearchPanel.currentPanel = undefined

    this.cancelActiveStream()
    this.panel.dispose()

    while (this.disposables.length) {
      const disposable = this.disposables.pop()
      if (disposable) {
        disposable.dispose()
      }
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'bundle.js')
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'out', 'webview', 'bundle.css')
    )

    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   script-src 'nonce-${nonce}';
                   style-src ${webview.cspSource} 'unsafe-inline';
                   font-src ${webview.cspSource};
                   img-src ${webview.cspSource} https:;">
    <title>Math Research Studio</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}
