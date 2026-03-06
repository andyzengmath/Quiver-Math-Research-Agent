import * as vscode from 'vscode'
import { PersonaManager } from './persona/manager'
import { TreeManager } from './dialogue/tree'
import { KnowledgeCache } from './knowledge/cache'
import { LlmService } from './llm/service'
import { StorageService } from './dialogue/storage'

export interface Services {
  readonly personaManager: PersonaManager
  readonly treeManager: TreeManager
  readonly llm: LlmService
  readonly knowledgeCache: KnowledgeCache
  readonly storage: StorageService
}

export function createServices(context: vscode.ExtensionContext): Services {
  const config = vscode.workspace.getConfiguration('mathAgent')
  const personaManager = new PersonaManager(
    <T>(key: string, defaultValue?: T): T | undefined => config.get<T>(key, defaultValue as T)
  )
  const llm = new LlmService(context)
  const knowledgeCache = new KnowledgeCache(context.globalState)
  const workspaceFolders = vscode.workspace.workspaceFolders
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? ''
  const storage = new StorageService(workspaceRoot)

  return {
    personaManager,
    treeManager: new TreeManager(),
    llm,
    knowledgeCache,
    storage,
  }
}
