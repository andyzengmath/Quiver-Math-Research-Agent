import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import { runMultiAgent, getMultiAgentPersonaIds } from '../../chat/multi-agent'
import type { Citation, RagStatus as KnowledgeRagStatus } from '../../knowledge/types'

/**
 * Converts internal RagStatus (from knowledge layer) to the simplified
 * webview-facing RagStatus format used by the protocol.
 */
function toWebviewRagStatus(ragResult: KnowledgeRagStatus): {
  state: 'searching' | 'found' | 'none' | 'error'
  citations?: ReadonlyArray<{ source: string; title: string; snippet: string; url: string }>
} {
  const hasCitations = ragResult.citations.length > 0
  const hasFailure =
    ragResult.sources.arxiv === 'failed' ||
    ragResult.sources.wikipedia === 'failed' ||
    ragResult.sources.nlab === 'failed'

  const allFailed =
    ragResult.sources.arxiv === 'failed' &&
    ragResult.sources.wikipedia === 'failed' &&
    ragResult.sources.nlab === 'failed'

  let state: 'found' | 'none' | 'error'
  if (allFailed) {
    state = 'error'
  } else if (hasCitations) {
    state = 'found'
  } else if (hasFailure) {
    state = 'error'
  } else {
    state = 'none'
  }

  return {
    state,
    citations: hasCitations
      ? ragResult.citations.map((c) => ({
          source: c.source,
          title: c.title,
          snippet: c.snippet,
          url: c.url,
        }))
      : undefined,
  }
}

export function registerSendHandler(registry: MessageHandlerRegistry): void {
  registry.register('send', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'send') {
      return
    }

    const { treeManager, contextBuilder, llm, storage, personaManager, ragOrchestrator } = panel.services

    // Get or create a tree
    let tree = panel.getCurrentTree()
    if (!tree) {
      // Auto-generate session title from first message (first 50 chars)
      const autoTitle = msg.content.length > 50
        ? msg.content.substring(0, 50).trim() + '...'
        : msg.content.trim()
      tree = treeManager.createTree(autoTitle || 'New Research')
      panel.setCurrentTree(tree)
    }

    const treeId = tree.id

    // Determine parent node: use provided nodeId, or the last node on the active path
    const parentId =
      msg.nodeId ??
      (tree.activePath.length > 0
        ? tree.activePath[tree.activePath.length - 1]
        : tree.rootId)

    // Add user node to the tree
    const userNode = treeManager.addNode(treeId, parentId, 'user', msg.content, {
      timestamp: Date.now(),
      model: 'user',
    })

    // Refresh our local reference after mutation
    tree = treeManager.getTree(treeId)
    panel.setCurrentTree(tree)

    // Post tree list update so TreeSelector shows the new/renamed session
    try {
      const entries = storage.listTrees()
      panel.postToWebview({ type: 'treeList', trees: entries })
    } catch {
      // Ignore list errors
    }

    // Post updated tree state to webview
    panel.postToWebview({ type: 'treeState', tree })

    // If multi-agent mode is active, run multi-agent orchestration instead
    if (tree.activePersona === 'multi-agent') {
      const cts = new vscode.CancellationTokenSource()
      panel.setActiveCancellation(cts)

      try {
        const personaIds = getMultiAgentPersonaIds()
        const result = await runMultiAgent(
          msg.content,
          personaIds,
          personaManager,
          contextBuilder,
          llm,
          tree,
          userNode.id,
          cts.token
        )

        // Store the synthesis as an assistant node in the tree
        const assistantNode = treeManager.addNode(
          treeId,
          userNode.id,
          'assistant',
          result.synthesis,
          {
            timestamp: Date.now(),
            model: 'multi-agent',
          }
        )

        // Post multi-agent result to webview
        panel.postToWebview({
          type: 'multiAgentResult',
          responses: result.individualResponses.map((r) => ({
            personaId: r.personaId,
            label: r.label,
            response: r.response,
          })),
          synthesis: result.synthesis,
        })

        panel.postToWebview({
          type: 'streamEnd',
          nodeId: assistantNode.id,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        const assistantNode = treeManager.addNode(
          treeId,
          userNode.id,
          'assistant',
          `[Multi-agent error: ${errorMessage}]`,
          {
            timestamp: Date.now(),
            model: 'multi-agent',
          }
        )
        panel.postToWebview({
          type: 'streamEnd',
          nodeId: assistantNode.id,
        })
      }

      // Save tree and post updated state
      tree = treeManager.getTree(treeId)
      panel.setCurrentTree(tree)

      try {
        storage.saveTree(tree)
      } catch {
        // Storage errors should not crash the handler
      }

      panel.postToWebview({ type: 'treeState', tree })
      panel.cancelActiveStream()
      return
    }

    // Check if RAG is enabled and enrich the message with citations
    const ragConfig = vscode.workspace.getConfiguration('mathAgent.rag')
    const ragEnabled = ragConfig.get<boolean>('enabled') ?? true

    let ragCitations: Citation[] = []
    let ragResult: KnowledgeRagStatus | null = null

    if (ragEnabled) {
      try {
        ragResult = await ragOrchestrator.enrich(msg.content)
        ragCitations = [...ragResult.citations]
      } catch {
        // RAG failures should not block the message flow
        ragResult = {
          enabled: true,
          sources: { arxiv: 'failed', wikipedia: 'failed', nlab: 'failed' },
          citations: [],
        }
      }
    }

    // Build LLM context from the conversation path, using active persona if set
    const llmMessages = contextBuilder.build(tree, userNode.id, {
      persona: tree.activePersona,
      ragCitations: ragCitations.length > 0 ? ragCitations : undefined,
    })

    // Create cancellation token for streaming
    const cts = new vscode.CancellationTokenSource()
    panel.setActiveCancellation(cts)

    // Get LLM config
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const provider = config.get<string>('provider', 'openai')
    const modelKey = `${provider}Model`
    const model = config.get<string>(modelKey, '')
    const reasoningEffort = config.get<'low' | 'medium' | 'high'>('reasoningEffort', 'medium')

    // Ensure the active provider is set
    try {
      llm.setProvider(provider)
    } catch {
      // Provider may not be registered; proceed anyway as getProvider will throw a clearer error
    }

    let fullText = ''
    let assistantNodeId: string | null = null
    let wasCancelled = false

    try {
      const stream = llm.sendMessage(llmMessages, { model, reasoningEffort }, cts.token)

      // Batch streaming chunks to avoid flooding the webview message queue
      let pendingChunks = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      const FLUSH_INTERVAL_MS = 150

      const flushChunks = () => {
        if (pendingChunks && assistantNodeId) {
          panel.postToWebview({
            type: 'streamChunk',
            nodeId: assistantNodeId,
            text: pendingChunks,
          })
          pendingChunks = ''
        }
        flushTimer = null
      }

      for await (const chunk of stream) {
        if (cts.token.isCancellationRequested) {
          wasCancelled = true
          break
        }

        fullText += chunk
        pendingChunks += chunk

        // Create assistant node on first chunk if not yet created
        if (!assistantNodeId) {
          const assistantNode = treeManager.addNode(
            treeId,
            userNode.id,
            'assistant',
            fullText,
            {
              timestamp: Date.now(),
              model: model || provider,
            }
          )
          assistantNodeId = assistantNode.id
        }

        // Flush on a timer to batch rapid chunks
        if (!flushTimer) {
          flushTimer = setTimeout(flushChunks, FLUSH_INTERVAL_MS)
        }
      }

      // Flush any remaining chunks
      if (flushTimer) {
        clearTimeout(flushTimer)
      }
      flushChunks()
    } catch (error) {
      if (cts.token.isCancellationRequested) {
        wasCancelled = true
      } else {
        // On error, still save partial content if any
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        fullText += `\n\n[Error: ${errorMessage}]`
      }
    }

    // Finalize the assistant node
    if (assistantNodeId) {
      // Update the node content with full accumulated text
      const currentTree = treeManager.getTree(treeId)
      const assistantNode = currentTree.nodes[assistantNodeId]
      if (assistantNode) {
        const updatedTree = {
          ...currentTree,
          nodes: {
            ...currentTree.nodes,
            [assistantNodeId]: {
              ...assistantNode,
              content: fullText,
              metadata: {
                ...assistantNode.metadata,
                ...(wasCancelled ? { incomplete: true } : {}),
                ...(ragCitations.length > 0 ? { sources: ragCitations } : {}),
              },
            },
          },
        }
        panel.setCurrentTree(updatedTree)
      }

      panel.postToWebview({
        type: 'streamEnd',
        nodeId: assistantNodeId,
      })

      // Post RAG status to the webview if RAG was invoked
      if (ragResult) {
        panel.postToWebview({
          type: 'ragStatus',
          nodeId: assistantNodeId,
          status: toWebviewRagStatus(ragResult),
        })
      }
    } else if (fullText.length === 0) {
      // No content received at all -- create an empty assistant node
      const assistantNode = treeManager.addNode(
        treeId,
        userNode.id,
        'assistant',
        wasCancelled ? '[Cancelled]' : '[No response]',
        {
          timestamp: Date.now(),
          model: model || provider,
          ...(wasCancelled ? { incomplete: true } : {}),
          ...(ragCitations.length > 0 ? { sources: ragCitations } : {}),
        }
      )
      panel.postToWebview({
        type: 'streamEnd',
        nodeId: assistantNode.id,
      })

      // Post RAG status for empty-response case as well
      if (ragResult) {
        panel.postToWebview({
          type: 'ragStatus',
          nodeId: assistantNode.id,
          status: toWebviewRagStatus(ragResult),
        })
      }
    }

    // Save tree and post updated state
    // Use panel's current tree (which may have immutable updates) over treeManager's copy
    const finalTree = panel.getCurrentTree() ?? treeManager.getTree(treeId)

    try {
      storage.saveTree(finalTree)
    } catch {
      // Storage errors should not crash the handler
    }

    panel.postToWebview({ type: 'treeState', tree: finalTree })

    // Cleanup cancellation source
    panel.cancelActiveStream()
  })
}
