import * as vscode from 'vscode'
import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'
import { runMultiAgent, getMultiAgentPersonaIds } from '../../chat/multi-agent'

export function registerSendHandler(registry: MessageHandlerRegistry): void {
  registry.register('send', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'send') {
      return
    }

    const { treeManager, contextBuilder, llm, storage, personaManager } = panel.services

    // Get or create a tree
    let tree = panel.getCurrentTree()
    if (!tree) {
      tree = treeManager.createTree('New Research')
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

    // Build LLM context from the conversation path, using active persona if set
    const llmMessages = contextBuilder.build(tree, userNode.id, {
      persona: tree.activePersona,
    })

    // Create cancellation token for streaming
    const cts = new vscode.CancellationTokenSource()
    panel.setActiveCancellation(cts)

    // Get LLM config
    const config = vscode.workspace.getConfiguration('mathAgent.llm')
    const provider = config.get<string>('provider', 'openai')
    const modelKey = `${provider}Model`
    const model = config.get<string>(modelKey, '')

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
      const stream = llm.sendMessage(llmMessages, { model }, cts.token)

      for await (const chunk of stream) {
        if (cts.token.isCancellationRequested) {
          wasCancelled = true
          break
        }

        fullText += chunk

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

        panel.postToWebview({
          type: 'streamChunk',
          nodeId: assistantNodeId,
          text: chunk,
        })
      }
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
        currentTree.nodes[assistantNodeId] = {
          ...assistantNode,
          content: fullText,
          metadata: {
            ...assistantNode.metadata,
            ...(wasCancelled ? { incomplete: true } : {}),
          },
        }
      }

      panel.postToWebview({
        type: 'streamEnd',
        nodeId: assistantNodeId,
      })
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

    // Cleanup cancellation source
    panel.cancelActiveStream()
  })
}
