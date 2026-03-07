import React, { useEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'

export interface Message {
  readonly id: string
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface MessageListProps {
  readonly messages: ReadonlyArray<Message>
}

export function MessageList({ messages }: MessageListProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
      ))}
    </div>
  )
}
