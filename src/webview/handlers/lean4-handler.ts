import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import type { LlmMessage } from '../../llm/types'
import type { Lean4Result } from '../../lean4/types'
import type { TreeManager } from '../../dialogue/tree'
import type { StorageService } from '../../dialogue/storage'

const TRANSLATE_PROMPT =
  'Translate this mathematical statement/proof into Lean4 code. ' +
  'Return only the Lean4 code block, no explanations.'

const FIX_PROMPT_PREFIX =
  'The following Lean4 code failed verification.\n\n'

const FIX_PROMPT_SUFFIX =
  '\n\nFix the code so it compiles and verifies successfully. ' +
  'Return only the corrected Lean4 code block, no explanations.'

const MAX_RETRY_ATTEMPTS = 3

/**
 * Extracts Lean4 code from LLM response text.
 * Handles responses wrapped in markdown code fences or plain text.
 */
function extractLeanCode(text: string): string {
  // Try to extract from ```lean4 or ```lean code fence
  const fenceRegex = /```(?:lean4?)\s*\n([\s\S]*?)```/
  const match = fenceRegex.exec(text)
  if (match) {
    return match[1].trim()
  }

  // Try generic code fence
  const genericFence = /```\s*\n([\s\S]*?)```/
  const genericMatch = genericFence.exec(text)
  if (genericMatch) {
    return genericMatch[1].trim()
  }

  // Return trimmed text as-is if no code fence found
  return text.trim()
}

/**
 * Collects all chunks from an LLM stream into a single string.
 */
async function collectStream(
  stream: AsyncIterable<string>,
  token: vscode.CancellationToken
): Promise<string> {
  let fullText = ''
  for await (const chunk of stream) {
    if (token.isCancellationRequested) {
      break
    }
    fullText += chunk
  }
  return fullText
}

export function registerLean4Handlers(registry: MessageHandlerRegistry): void {
  // Handler: verifyLean4
  registry.register('verifyLean4', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'verifyLean4') {
      return
    }

    const { llm, lean4, treeManager, storage } = panel.services
    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const node = tree.nodes[msg.nodeId]
    if (!node) {
      return
    }

    // Get LLM config
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const provider = config.get<string>('provider', 'openai')
    const modelKey = `${provider}Model`
    const model = config.get<string>(modelKey, '')

    try {
      llm.setProvider(provider)
    } catch {
      // Provider may not be registered
    }

    const cts = new vscode.CancellationTokenSource()

    try {
      // Step 1: Send node content to LLM for Lean4 translation
      const messages: LlmMessage[] = [
        { role: 'system', content: TRANSLATE_PROMPT },
        { role: 'user', content: node.content },
      ]

      const stream = llm.sendMessage(messages, { model }, cts.token)
      const responseText = await collectStream(stream, cts.token)
      const leanCode = extractLeanCode(responseText)

      // Step 2: Verify the generated Lean4 code
      const result = await lean4.verify(leanCode)

      // Step 3: Store result in node metadata and save tree
      storeLean4Result(panel, tree.id, msg.nodeId, result, treeManager, storage)

      // Step 4: Post result to webview
      panel.postToWebview({ type: 'lean4Result', nodeId: msg.nodeId, result })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorResult: Lean4Result = {
        status: 'error',
        leanCode: '',
        diagnostics: [errorMessage],
        verifiedAt: Date.now(),
      }

      storeLean4Result(panel, tree.id, msg.nodeId, errorResult, treeManager, storage)
      panel.postToWebview({ type: 'lean4Result', nodeId: msg.nodeId, result: errorResult })
    } finally {
      cts.dispose()
    }
  })

  // Handler: retryLean4
  registry.register('retryLean4', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'retryLean4') {
      return
    }

    if (msg.attempt >= MAX_RETRY_ATTEMPTS) {
      return
    }

    const { llm, lean4, treeManager, storage } = panel.services
    const tree = panel.getCurrentTree()
    if (!tree) {
      return
    }

    const node = tree.nodes[msg.nodeId]
    if (!node) {
      return
    }

    // Get previous result from node metadata
    const previousResult = node.metadata.lean4Result
    const previousCode = previousResult?.leanCode ?? ''
    const previousDiagnostics = previousResult?.diagnostics ?? []

    // Get LLM config
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const provider = config.get<string>('provider', 'openai')
    const modelKey = `${provider}Model`
    const model = config.get<string>(modelKey, '')

    try {
      llm.setProvider(provider)
    } catch {
      // Provider may not be registered
    }

    const cts = new vscode.CancellationTokenSource()

    try {
      // Build fix prompt with previous code and diagnostics
      const fixContent =
        FIX_PROMPT_PREFIX +
        `Code:\n\`\`\`lean4\n${previousCode}\n\`\`\`\n\n` +
        `Errors:\n${previousDiagnostics.join('\n')}` +
        FIX_PROMPT_SUFFIX

      const messages: LlmMessage[] = [
        { role: 'system', content: TRANSLATE_PROMPT },
        { role: 'user', content: node.content },
        { role: 'assistant', content: `\`\`\`lean4\n${previousCode}\n\`\`\`` },
        { role: 'user', content: fixContent },
      ]

      const stream = llm.sendMessage(messages, { model }, cts.token)
      const responseText = await collectStream(stream, cts.token)
      const leanCode = extractLeanCode(responseText)

      // Re-verify the fixed code
      const result = await lean4.verify(leanCode)

      // Store and post result
      storeLean4Result(panel, tree.id, msg.nodeId, result, treeManager, storage)
      panel.postToWebview({ type: 'lean4Result', nodeId: msg.nodeId, result })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorResult: Lean4Result = {
        status: 'error',
        leanCode: previousCode,
        diagnostics: [errorMessage],
        verifiedAt: Date.now(),
      }

      storeLean4Result(panel, tree.id, msg.nodeId, errorResult, treeManager, storage)
      panel.postToWebview({ type: 'lean4Result', nodeId: msg.nodeId, result: errorResult })
    } finally {
      cts.dispose()
    }
  })
}

/**
 * Stores a Lean4 verification result in the node's metadata and saves the tree.
 */
function storeLean4Result(
  panel: MathResearchPanel,
  treeId: string,
  nodeId: string,
  result: Lean4Result,
  treeManager: TreeManager,
  storage: StorageService
): void {
  const currentTree = treeManager.getTree(treeId)
  const targetNode = currentTree.nodes[nodeId]
  const treeToSave = targetNode
    ? {
        ...currentTree,
        nodes: {
          ...currentTree.nodes,
          [nodeId]: {
            ...targetNode,
            metadata: {
              ...targetNode.metadata,
              lean4Result: result,
            },
          },
        },
      }
    : currentTree

  panel.setCurrentTree(treeToSave)

  try {
    storage.saveTree(treeToSave)
  } catch {
    // Storage errors should not crash the handler
  }
}
