import * as vscode from 'vscode'
import { PersonaManager } from './persona/manager'

export interface Services {
  readonly personaManager: PersonaManager
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createServices(_context: vscode.ExtensionContext): Services {
  const config = vscode.workspace.getConfiguration('mathAgent')
  const personaManager = new PersonaManager(
    <T>(key: string, defaultValue?: T): T | undefined => config.get<T>(key, defaultValue as T)
  )

  return {
    personaManager,
  }
}
