import React, { useEffect, useRef, useCallback } from 'react'
import { MessageBubble } from './MessageBubble'
import { RagIndicator } from './RagIndicator'
import type { RagStatus } from '../types'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly childCount?: number
}

export interface MessageListProps {
  readonly messages: ReadonlyArray<Message>
  readonly onDeleteBranch?: (nodeId: string) => void
  readonly ragStatusByNode?: ReadonlyMap<string, RagStatus>
  readonly onDismissCitation?: (nodeId: string, url: string) => void
  readonly onOpenUrl?: (url: string) => void
}

export function MessageList({
  messages,
  onDeleteBranch,
  ragStatusByNode,
  onDismissCitation,
  onOpenUrl,
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
            />
            {msg.role === 'assistant' && ragStatus && (
              <RagIndicator
                ragStatus={ragStatus}
                onDismissCitation={(url) => handleDismissCitation(msg.id, url)}
                onOpenUrl={handleOpenUrl}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
