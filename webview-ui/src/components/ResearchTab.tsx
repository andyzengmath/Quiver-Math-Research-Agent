import React, { useCallback, useEffect, useMemo } from 'react'
import { MessageList, type Message, type BranchPoint } from './MessageList'
import { MessageInput } from './MessageInput'
import { useWebviewMessage } from '../hooks/useWebviewMessage'
import { useTreeState } from '../hooks/useTreeState'
import { useStreaming } from '../hooks/useStreaming'
import type { DialogueNode } from '../types'
import './MessageList.css'

export function ResearchTab(): React.ReactElement {
  const { lastMessage, postMessage } = useWebviewMessage()
  const { tree, messages: treeMessages } = useTreeState(lastMessage)
  const { streamingNodeId, streamingText, isStreaming } = useStreaming(lastMessage)

  // On mount, request current state from extension host
  useEffect(() => {
    postMessage({ type: 'requestState' })
  }, [postMessage])

  const handleSend = useCallback(
    (text: string) => {
      postMessage({ type: 'send', content: text })
    },
    [postMessage]
  )

  const handleStop = useCallback(() => {
    postMessage({ type: 'stopStream' })
  }, [postMessage])

  const handleFork = useCallback(
    (nodeId: string) => {
      postMessage({ type: 'fork', nodeId })
    },
    [postMessage]
  )

  const handleSwitchBranch = useCallback(
    (nodeId: string) => {
      postMessage({ type: 'switchBranch', nodeId })
    },
    [postMessage]
  )

  // Build the display messages: tree messages + streaming assistant bubble
  const displayMessages = useMemo<ReadonlyArray<Message>>(() => {
    const msgs: Message[] = treeMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }))

    // If currently streaming, add/replace the streaming assistant message
    if (streamingNodeId && streamingText) {
      // Check if the streaming node is already in the tree messages
      const existingIndex = msgs.findIndex((m) => m.id === streamingNodeId)
      if (existingIndex >= 0) {
        // Replace with live streaming version
        msgs[existingIndex] = {
          id: streamingNodeId,
          role: 'assistant',
          content: streamingText,
        }
      } else {
        // Append as a new message
        msgs.push({
          id: streamingNodeId,
          role: 'assistant',
          content: streamingText,
        })
      }
    }

    return msgs
  }, [treeMessages, streamingNodeId, streamingText])

  // Compute branch points: for each node in the active path that has multiple children,
  // show BranchCards for the non-active siblings
  const branchPoints = useMemo<ReadonlyArray<BranchPoint>>(() => {
    if (!tree) {
      return []
    }

    const activePath = tree.activePath
    const activePathSet = new Set(activePath)
    const result: BranchPoint[] = []

    for (const nodeId of activePath) {
      const node: DialogueNode | undefined = tree.nodes[nodeId]
      if (!node || node.children.length <= 1) {
        continue
      }

      // This node has multiple children -- find siblings (non-active children)
      const siblings: BranchPoint['siblings'][number][] = []
      for (const childId of node.children) {
        const childNode: DialogueNode | undefined = tree.nodes[childId]
        if (!childNode) {
          continue
        }
        // Skip system nodes with empty content (fork placeholders)
        const isOnActivePath = activePathSet.has(childId)
        const previewText = childNode.content || `(${childNode.role})`

        siblings.push({
          nodeId: childId,
          previewText,
          childCount: childNode.children.length,
          isActive: isOnActivePath,
        })
      }

      // Only show branch cards if there are non-active siblings
      const hasNonActive = siblings.some((s) => !s.isActive)
      if (hasNonActive) {
        result.push({
          afterNodeId: nodeId,
          siblings,
        })
      }
    }

    return result
  }, [tree])

  const nodes = tree?.nodes ?? undefined

  return (
    <div className="research-tab">
      <MessageList
        messages={displayMessages}
        nodes={nodes}
        onFork={handleFork}
        onSwitchBranch={handleSwitchBranch}
        branchPoints={branchPoints}
      />
      <div className="input-area">
        {isStreaming && (
          <button
            type="button"
            className="stop-button"
            onClick={handleStop}
          >
            Stop
          </button>
        )}
        <MessageInput onSend={handleSend} />
      </div>
    </div>
  )
}
