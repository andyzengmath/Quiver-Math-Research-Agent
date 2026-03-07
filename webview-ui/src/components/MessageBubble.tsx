import React from 'react'
import { renderMathMarkdown } from '../utils/renderMarkdown'

export interface MessageBubbleProps {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export function MessageBubble({ role, content }: MessageBubbleProps): React.ReactElement {
  const rendered = renderMathMarkdown(content)

  return (
    <div className={`message-bubble ${role === 'user' ? 'user-message' : 'assistant-message'}`}>
      <div
        className="message-content"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  )
}
