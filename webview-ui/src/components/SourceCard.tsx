import React, { useCallback } from 'react'
import type { RagCitation } from '../types'

export interface SourceCardProps {
  readonly citation: RagCitation
  readonly onDismiss: () => void
  readonly onOpenUrl: (url: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
  arxiv: 'arXiv',
  wikipedia: 'Wikipedia',
  nlab: 'nLab',
}

/**
 * Displays a single citation source card with title, source badge,
 * snippet preview, and a clickable URL.
 */
export function SourceCard({
  citation,
  onDismiss,
  onOpenUrl,
}: SourceCardProps): React.ReactElement {
  const handleUrlClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onOpenUrl(citation.url)
    },
    [citation.url, onOpenUrl]
  )

  const truncatedSnippet =
    citation.snippet.length > 100
      ? citation.snippet.slice(0, 100) + '\u2026'
      : citation.snippet

  const sourceLabel = SOURCE_LABELS[citation.source] ?? citation.source

  return (
    <div className="source-card">
      <div className="source-card__header">
        <span className="source-card__title">{citation.title}</span>
        <span className={`source-card__badge source-card__badge--${citation.source}`}>
          {sourceLabel}
        </span>
        <button
          type="button"
          className="source-card__dismiss"
          onClick={onDismiss}
          title="Dismiss citation"
          aria-label="Dismiss citation"
        >
          x
        </button>
      </div>
      {truncatedSnippet && (
        <p className="source-card__snippet">{truncatedSnippet}</p>
      )}
      {citation.url && (
        <a
          className="source-card__url"
          href={citation.url}
          onClick={handleUrlClick}
          title={citation.url}
        >
          {citation.url.length > 60
            ? citation.url.slice(0, 60) + '\u2026'
            : citation.url}
        </a>
      )}
    </div>
  )
}
