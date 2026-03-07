import * as vscode from 'vscode'

export class MathResearchPanel {
  public static readonly viewType = 'mathAgent.researchPanel'

  private static currentPanel: MathResearchPanel | undefined

  private readonly panel: vscode.WebviewPanel
  private readonly extensionUri: vscode.Uri
  private disposables: vscode.Disposable[] = []

  public static createOrShow(context: vscode.ExtensionContext): void {
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

    MathResearchPanel.currentPanel = new MathResearchPanel(panel, context.extensionUri)
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel
    this.extensionUri = extensionUri

    this.panel.webview.html = this.getHtmlForWebview(this.panel.webview)

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  private dispose(): void {
    MathResearchPanel.currentPanel = undefined

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
