import React, { useCallback } from 'react'
import { renderMathMarkdown } from '../utils/renderMarkdown'

export interface MessageBubbleProps {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly nodeId?: string
  readonly childCount?: number
  readonly onFork?: (nodeId: string) => void
}

function BranchIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M5 3a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm0 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0zm10-10a2 2 0 1 0-4 0 2 2 0 0 0 4 0zM3 5v6M3 5c2 0 4 0 5 2s3 4 5 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MessageBubble({
  role,
  content,
  nodeId,
  childCount,
  onFork,
}: MessageBubbleProps): React.ReactElement {
  const rendered = renderMathMarkdown(content)

  const handleFork = useCallback(() => {
    if (nodeId && onFork) {
      onFork(nodeId)
    }
  }, [nodeId, onFork])

  return (
    <div className={`message-bubble ${role === 'user' ? 'user-message' : 'assistant-message'}`}>
      {nodeId && onFork && (
        <button
          type="button"
          className="fork-button"
          onClick={handleFork}
          title={`Fork from this message${childCount !== undefined && childCount > 0 ? ` (${childCount} branch${childCount === 1 ? '' : 'es'})` : ''}`}
          aria-label="Fork branch from this message"
        >
          <BranchIcon />
        </button>
      )}
      <div
        className="message-content"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  )
}
