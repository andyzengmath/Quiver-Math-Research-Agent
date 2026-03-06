import * as vscode from 'vscode'
import * as child_process from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import { PersonaManager } from './persona/manager'
import { TreeManager } from './dialogue/tree'
import { KnowledgeCache } from './knowledge/cache'
import { LlmService } from './llm/service'
import { AnthropicProvider } from './llm/providers/anthropic'
import { OpenAiProvider } from './llm/providers/openai'
import { StorageService } from './dialogue/storage'
import { ContextBuilder } from './dialogue/context'
import { Lean4Service } from './lean4/service'

export interface Services {
  readonly personaManager: PersonaManager
  readonly treeManager: TreeManager
  readonly llm: LlmService
  readonly knowledgeCache: KnowledgeCache
  readonly storage: StorageService
  readonly contextBuilder: ContextBuilder
  readonly lean4: Lean4Service
}

export function createServices(context: vscode.ExtensionContext): Services {
  const config = vscode.workspace.getConfiguration('mathAgent')
  const personaManager = new PersonaManager(
    <T>(key: string, defaultValue?: T): T | undefined => config.get<T>(key, defaultValue as T)
  )
  const llm = new LlmService(context)
  const knowledgeCache = new KnowledgeCache(context.globalState)

  const anthropicProvider = new AnthropicProvider(
    (key: string) => llm.getApiKey(key)
  )
  llm.registerProvider(anthropicProvider)
  llm.registerProvider(new OpenAiProvider(llm))

  const workspaceFolders = vscode.workspace.workspaceFolders
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath ?? ''
  const storage = new StorageService(workspaceRoot)
  const contextBuilder = new ContextBuilder(personaManager)
  const lean4 = new Lean4Service({
    getConfig: (key: string) =>
      vscode.workspace.getConfiguration().get(key),
    execFile: (file, args, options, callback) =>
      child_process.execFile(file, args as string[], options, callback),
    fs: {
      writeFile: (path, data, opts, callback) =>
        fs.writeFile(path, data, opts, callback),
      unlink: (path, callback) => fs.unlink(path, callback),
      tmpdir: () => os.tmpdir(),
    },
  })

  return {
    personaManager,
    treeManager: new TreeManager(),
    llm,
    knowledgeCache,
    storage,
    contextBuilder,
    lean4,
  }
}
