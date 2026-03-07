import React, { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import { BranchCard } from './BranchCard'
import type { DialogueNode } from '../types'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface BranchPoint {
  /** The nodeId after which branch cards should appear (the parent in the active path) */
  readonly afterNodeId: string
  /** Sibling branches (non-active children of the parent) */
  readonly siblings: ReadonlyArray<{
    readonly nodeId: string
    readonly previewText: string
    readonly childCount: number
    readonly isActive: boolean
  }>
}

export interface MessageListProps {
  readonly messages: ReadonlyArray<Message>
  readonly nodes?: Readonly<Record<string, DialogueNode>>
  readonly onFork?: (nodeId: string) => void
  readonly onSwitchBranch?: (nodeId: string) => void
  readonly branchPoints?: ReadonlyArray<BranchPoint>
}

export function MessageList({
  messages,
  nodes,
  onFork,
  onSwitchBranch,
  branchPoints,
}: MessageListProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  // Build a lookup of branch points by afterNodeId
  const branchPointMap = new Map<string, BranchPoint>()
  if (branchPoints) {
    for (const bp of branchPoints) {
      branchPointMap.set(bp.afterNodeId, bp)
    }
  }

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map((msg) => {
        const node = nodes?.[msg.id]
        const childCount = node?.children.length ?? 0

        const bp = branchPointMap.get(msg.id)

        return (
          <React.Fragment key={msg.id}>
            <MessageBubble
              role={msg.role}
              content={msg.content}
              nodeId={msg.id}
              childCount={childCount}
              onFork={onFork}
            />
            {bp && bp.siblings.length > 0 && onSwitchBranch && (
              <div className="branch-cards-container">
                {bp.siblings.map((sibling) => (
                  <BranchCard
                    key={sibling.nodeId}
                    nodeId={sibling.nodeId}
                    previewText={sibling.previewText}
                    childCount={sibling.childCount}
                    isActive={sibling.isActive}
                    onClick={onSwitchBranch}
                  />
                ))}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
