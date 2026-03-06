import * as vscode from 'vscode'
import { createServices } from './services'

export function activate(context: vscode.ExtensionContext): void {
  const services = createServices(context)

  const openPanelCommand = vscode.commands.registerCommand(
    'mathAgent.openPanel',
    () => {
      vscode.window.showInformationMessage('Math Research Studio (placeholder)')
    }
  )

  context.subscriptions.push(openPanelCommand)

  // Suppress unused variable warning — services will be used by subsequent stories
  void services
}

export function deactivate(): void {
  // cleanup
}
