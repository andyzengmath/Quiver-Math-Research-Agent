import React, { useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { RagIndicator } from './RagIndicator'
import { Lean4Badge } from './Lean4Badge'
import type { RagStatus, Lean4Result } from '../types'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly childCount?: number
}

export interface MessageListProps {
  readonly messages: ReadonlyArray<Message>
  readonly onDeleteBranch?: (nodeId: string) => void
  readonly onFork?: (nodeId: string) => void
  readonly streamingNodeId?: string | null
  readonly ragStatusByNode?: ReadonlyMap<string, RagStatus>
  readonly onDismissCitation?: (nodeId: string, url: string) => void
  readonly onOpenUrl?: (url: string) => void
  readonly lean4Available?: boolean
  readonly lean4ResultsByNode?: ReadonlyMap<string, Lean4Result>
  readonly onVerifyLean4?: (nodeId: string) => void
  readonly onRetryLean4?: (nodeId: string) => void
}

export function MessageList({
  messages,
  onDeleteBranch,
  onFork,
  streamingNodeId,
  ragStatusByNode,
  onDismissCitation,
  onOpenUrl,
  lean4Available,
  lean4ResultsByNode,
  onVerifyLean4,
  onRetryLean4,
}: MessageListProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  const handleDismissCitation = useCallback(
    (nodeId: string, url: string) => {
      onDismissCitation?.(nodeId, url)
    },
    [onDismissCitation]
  )

  const handleOpenUrl = useCallback(
    (url: string) => {
      onOpenUrl?.(url)
    },
    [onOpenUrl]
  )

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map((msg) => {
        const ragStatus = ragStatusByNode?.get(msg.id)
        return (
          <React.Fragment key={msg.id}>
            <MessageBubble
              role={msg.role}
              content={msg.content}
              nodeId={msg.id}
              childCount={msg.childCount}
              onDeleteBranch={onDeleteBranch}
              onFork={onFork}
              isStreaming={msg.id === streamingNodeId}
            />
            {msg.role === 'assistant' && ragStatus && (
              <RagIndicator
                ragStatus={ragStatus}
                onDismissCitation={(url) => handleDismissCitation(msg.id, url)}
                onOpenUrl={handleOpenUrl}
              />
            )}
            {msg.role === 'assistant' && lean4Available && (
              <Lean4Badge
                lean4Available={lean4Available}
                lean4Result={lean4ResultsByNode?.get(msg.id)}
                onVerify={() => onVerifyLean4?.(msg.id)}
                onRetry={() => onRetryLean4?.(msg.id)}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
