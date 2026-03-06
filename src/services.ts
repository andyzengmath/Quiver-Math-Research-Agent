import * as vscode from 'vscode'
import { PersonaManager } from './persona/manager'
import { TreeManager } from './dialogue/tree'
import { LlmService } from './llm/service'

export interface Services {
  readonly personaManager: PersonaManager
  readonly treeManager: TreeManager
  readonly llm: LlmService
}

export function createServices(context: vscode.ExtensionContext): Services {
  const config = vscode.workspace.getConfiguration('mathAgent')
  const personaManager = new PersonaManager(
    <T>(key: string, defaultValue?: T): T | undefined => config.get<T>(key, defaultValue as T)
  )
  const llm = new LlmService(context)

  return {
    personaManager,
    treeManager: new TreeManager(),
    llm,
  }
}
