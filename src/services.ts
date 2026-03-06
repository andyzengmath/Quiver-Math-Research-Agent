import * as vscode from 'vscode'
import { PersonaManager } from './persona/manager'
import { TreeManager } from './dialogue/tree'
import { KnowledgeCache } from './knowledge/cache'
import { LlmService } from './llm/service'

export interface Services {
  readonly personaManager: PersonaManager
  readonly treeManager: TreeManager
  readonly llm: LlmService
  readonly knowledgeCache: KnowledgeCache
}

export function createServices(context: vscode.ExtensionContext): Services {
  const config = vscode.workspace.getConfiguration('mathAgent')
  const personaManager = new PersonaManager(
    <T>(key: string, defaultValue?: T): T | undefined => config.get<T>(key, defaultValue as T)
  )
  const llm = new LlmService(context)
  const knowledgeCache = new KnowledgeCache(context.globalState)

  return {
    personaManager,
    treeManager: new TreeManager(),
    llm,
    knowledgeCache,
  }
}
