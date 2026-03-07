import React, { useCallback, useEffect, useMemo } from 'react'
import { MessageList, type Message } from './MessageList'
import { MessageInput } from './MessageInput'
import { useWebviewMessage } from '../hooks/useWebviewMessage'
import { useTreeState } from '../hooks/useTreeState'
import { useStreaming } from '../hooks/useStreaming'
import './MessageList.css'

function countDescendants(
  nodes: Readonly<Record<string, { readonly children: ReadonlyArray<string> }>>,
  nodeId: string
): number {
  const node = nodes[nodeId]
  if (!node) {
    return 0
  }
  let count = 0
  const stack = [...node.children]
  while (stack.length > 0) {
    const childId = stack.pop()!
    count += 1
    const child = nodes[childId]
    if (child) {
      for (const grandchildId of child.children) {
        stack.push(grandchildId)
      }
    }
  }
  return count
}

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

  const handleDeleteBranch = useCallback(
    (nodeId: string) => {
      postMessage({ type: 'deleteBranch', nodeId })
    },
    [postMessage]
  )

  // Build the display messages: tree messages + streaming assistant bubble
  const displayMessages = useMemo<ReadonlyArray<Message>>(() => {
    const msgs: Message[] = treeMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      childCount: tree ? countDescendants(tree.nodes, m.id) : 0,
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
          childCount: 0,
        }
      } else {
        // Append as a new message
        msgs.push({
          id: streamingNodeId,
          role: 'assistant',
          content: streamingText,
          childCount: 0,
        })
      }
    }

    return msgs
  }, [treeMessages, tree, streamingNodeId, streamingText])

  return (
    <div className="research-tab">
      <MessageList messages={displayMessages} onDeleteBranch={handleDeleteBranch} />
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
