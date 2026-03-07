import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageList, type Message } from './MessageList'
import { MessageInput } from './MessageInput'
import { Breadcrumb, type BreadcrumbSegment } from './Breadcrumb'
import { MultiAgentCards } from './MultiAgentCards'
import { RagToggle } from './RagToggle'
import { useWebviewMessage } from '../hooks/useWebviewMessage'
import { useTreeState } from '../hooks/useTreeState'
import { useStreaming } from '../hooks/useStreaming'
import { useMultiAgent } from '../hooks/useMultiAgent'
import { useRagStatus } from '../hooks/useRagStatus'
import type { DialogueNode, DialogueTree } from '../types'
import './MessageList.css'
import './RagComponents.css'

const MAX_VISIBLE_SIBLINGS = 5

interface SiblingInfo {
  readonly nodeId: string
  readonly label: string
  readonly isActive: boolean
}

function buildBreadcrumbPath(tree: DialogueTree): ReadonlyArray<BreadcrumbSegment> {
  const segments: BreadcrumbSegment[] = []

  for (const nodeId of tree.activePath) {
    const node: DialogueNode | undefined = tree.nodes[nodeId]
    if (!node) {
      continue
    }
    // Skip system nodes (root)
    if (node.role === 'system') {
      continue
    }
    const label = node.content.length > 0 ? node.content : `(${node.role})`
    segments.push({ nodeId: node.id, label })
  }

  return segments
}

function findBranchPointSiblings(tree: DialogueTree): ReadonlyArray<SiblingInfo> {
  // Find the first branch point in the active path where a parent has >1 children
  // We look for nodes whose parent has multiple children (i.e., there are sibling branches)
  const activePathSet = new Set(tree.activePath)

  for (const nodeId of tree.activePath) {
    const node: DialogueNode | undefined = tree.nodes[nodeId]
    if (!node || !node.parentId) {
      continue
    }

    const parent = tree.nodes[node.parentId]
    if (!parent || parent.children.length <= 1) {
      continue
    }

    // This node has siblings -- return info about all siblings
    return parent.children.map((childId) => {
      const childNode = tree.nodes[childId]
      const content = childNode?.content ?? ''
      const label = content.length > 0 ? content : `(${childNode?.role ?? 'unknown'})`
      return {
        nodeId: childId,
        label,
        isActive: activePathSet.has(childId),
      }
    })
  }

  return []
}

export function ResearchTab(): React.ReactElement {
  const { lastMessage, postMessage } = useWebviewMessage()
  const { tree, messages: treeMessages } = useTreeState(lastMessage)
  const { streamingNodeId, streamingText, isStreaming } = useStreaming(lastMessage)
  const { responses: multiAgentResponses, synthesis: multiAgentSynthesis, isActive: isMultiAgentActive } = useMultiAgent(lastMessage)
  const { ragStatusByNode, dismissCitation } = useRagStatus(lastMessage)

  const [expandedSiblings, setExpandedSiblings] = useState(false)
  const [ragEnabled, setRagEnabled] = useState(true)

  // Scroll position storage per branch (keyed by last nodeId in activePath)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const messageListContainerRef = useRef<HTMLDivElement>(null)
  const previousBranchKeyRef = useRef<string | null>(null)

  // On mount, request current state from extension host
  useEffect(() => {
    postMessage({ type: 'requestState' })
  }, [postMessage])

  // Compute branch key from active path
  const branchKey = useMemo(() => {
    if (!tree || tree.activePath.length === 0) {
      return null
    }
    return tree.activePath[tree.activePath.length - 1]
  }, [tree])

  // Save/restore scroll position when branch changes
  useEffect(() => {
    const container = messageListContainerRef.current
    if (!container) {
      return
    }

    const prevKey = previousBranchKeyRef.current
    // Save scroll position for previous branch
    if (prevKey) {
      const scrollableEl = container.querySelector('.message-list')
      if (scrollableEl) {
        scrollPositionsRef.current.set(prevKey, scrollableEl.scrollTop)
      }
    }

    // Restore scroll position for new branch
    if (branchKey) {
      const savedScroll = scrollPositionsRef.current.get(branchKey)
      if (savedScroll !== undefined) {
        requestAnimationFrame(() => {
          const scrollableEl = container.querySelector('.message-list')
          if (scrollableEl) {
            scrollableEl.scrollTop = savedScroll
          }
        })
      }
    }

    previousBranchKeyRef.current = branchKey

    // Reset expanded siblings toggle when branch changes
    setExpandedSiblings(false)
  }, [branchKey])

  const handleSend = useCallback(
    (text: string) => {
      postMessage({ type: 'send', content: text })
    },
    [postMessage]
  )

  const handleStop = useCallback(() => {
    postMessage({ type: 'stopStream' })
  }, [postMessage])

  const handleBreadcrumbNavigate = useCallback(
    (nodeId: string) => {
      postMessage({ type: 'switchBranch', nodeId })
    },
    [postMessage]
  )

  const handleSiblingSwitch = useCallback(
    (nodeId: string) => {
      postMessage({ type: 'switchBranch', nodeId })
    },
    [postMessage]
  )

  const handleRagToggle = useCallback(
    (enabled: boolean) => {
      setRagEnabled(enabled)
      postMessage({ type: 'setRagEnabled', enabled })
    },
    [postMessage]
  )

  const handleOpenUrl = useCallback(
    (url: string) => {
      postMessage({ type: 'openUrl', url })
    },
    [postMessage]
  )

  const handlePromoteToBranch = useCallback(
    (_personaId: string, content: string) => {
      // Fork from the last node on the active path, then send the promoted content
      if (tree && tree.activePath.length > 0) {
        const lastNodeId = tree.activePath[tree.activePath.length - 1]
        postMessage({ type: 'fork', nodeId: lastNodeId })
        postMessage({ type: 'send', content })
      }
    },
    [postMessage, tree]
  )

  // Build breadcrumb path from tree
  const breadcrumbPath = useMemo<ReadonlyArray<BreadcrumbSegment>>(() => {
    if (!tree) {
      return []
    }
    return buildBreadcrumbPath(tree)
  }, [tree])

  // Find sibling branches at the first branch point
  const siblings = useMemo<ReadonlyArray<SiblingInfo>>(() => {
    if (!tree) {
      return []
    }
    return findBranchPointSiblings(tree)
  }, [tree])

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

  // Determine visible siblings with +N more logic
  const visibleSiblings = useMemo(() => {
    if (siblings.length <= MAX_VISIBLE_SIBLINGS || expandedSiblings) {
      return { items: siblings, hiddenCount: 0 }
    }
    return {
      items: siblings.slice(0, MAX_VISIBLE_SIBLINGS),
      hiddenCount: siblings.length - MAX_VISIBLE_SIBLINGS,
    }
  }, [siblings, expandedSiblings])

  const hasSiblings = siblings.length > 1

  return (
    <div className="research-tab" ref={messageListContainerRef}>
      <div className="research-tab__header-bar">
        {breadcrumbPath.length > 0 && (
          <Breadcrumb path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
        )}
        <div className="research-tab__header-actions">
          <RagToggle enabled={ragEnabled} onToggle={handleRagToggle} />
        </div>
      </div>
      {hasSiblings && (
        <div className="branch-siblings-bar">
          {visibleSiblings.items.map((sib) => (
            <button
              key={sib.nodeId}
              type="button"
              className={`branch-sibling-chip ${sib.isActive ? 'branch-sibling-chip--active' : ''}`}
              onClick={() => {
                if (!sib.isActive) {
                  handleSiblingSwitch(sib.nodeId)
                }
              }}
              title={sib.label}
            >
              {sib.label.length > 20 ? sib.label.slice(0, 20) + '\u2026' : sib.label}
            </button>
          ))}
          {visibleSiblings.hiddenCount > 0 && (
            <button
              type="button"
              className="branch-expander-button"
              onClick={() => setExpandedSiblings(true)}
            >
              +{visibleSiblings.hiddenCount} more
            </button>
          )}
        </div>
      )}
      <MessageList
        messages={displayMessages}
        ragStatusByNode={ragStatusByNode}
        onDismissCitation={dismissCitation}
        onOpenUrl={handleOpenUrl}
      />
      {isMultiAgentActive && (
        <MultiAgentCards
          responses={multiAgentResponses}
          synthesis={multiAgentSynthesis}
          onPromoteToBranch={handlePromoteToBranch}
        />
      )}
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
