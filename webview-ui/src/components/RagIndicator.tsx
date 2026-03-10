import React, { useState, useCallback } from 'react'
import type { RagStatus, RagCitation } from '../types'
import { SourceCard } from './SourceCard'

export interface RagIndicatorProps {
  readonly ragStatus: RagStatus
  readonly onDismissCitation: (url: string) => void
  readonly onOpenUrl: (url: string) => void
}

const SOURCE_LABELS: Record<string, string> = {
  arxiv: 'arXiv',
  wikipedia: 'Wikipedia',
  nlab: 'nLab',
}

/**
 * Pill/badge that shows below assistant messages when RAG enrichment returned results.
 * Displays source names (strike-through for failed), clickable to expand citation cards.
 */
export function RagIndicator({
  ragStatus,
  onDismissCitation,
  onOpenUrl,
}: RagIndicatorProps): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false)

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  // Nothing to show if state is 'none' or 'searching'
  if (ragStatus.state === 'none' || ragStatus.state === 'searching') {
    return null
  }

  // Collect unique source names from citations
  const sourceNames: ReadonlyArray<string> = ragStatus.citations
    ? [...new Set(ragStatus.citations.map((c) => c.source))]
    : []

  // Build display labels for sources
  const sourceLabels = sourceNames.map(
    (name) => SOURCE_LABELS[name] ?? name
  )

  const pillText =
    ragStatus.state === 'error'
      ? 'Sources: error'
      : sourceLabels.length > 0
        ? `Sources: ${sourceLabels.join(', ')}`
        : 'Sources: none'

  const citations: ReadonlyArray<RagCitation> = ragStatus.citations ?? []

  return (
    <div className="rag-indicator">
      <button
        type="button"
        className={`rag-indicator__pill ${
          ragStatus.state === 'error' ? 'rag-indicator__pill--error' : ''
        } ${expanded ? 'rag-indicator__pill--expanded' : ''}`}
        onClick={toggleExpanded}
        title={expanded ? 'Collapse sources' : 'Expand sources'}
      >
        <span className="rag-indicator__pill-text">{pillText}</span>
        <span className="rag-indicator__pill-arrow">
          {expanded ? '\u25B2' : '\u25BC'}
        </span>
      </button>
      {expanded && citations.length > 0 && (
        <div className="rag-indicator__cards">
          {citations.map((citation) => (
            <SourceCard
              key={citation.url}
              citation={citation}
              onDismiss={() => onDismissCitation(citation.url)}
              onOpenUrl={onOpenUrl}
            />
          ))}
        </div>
      )}
    </div>
  )
}
