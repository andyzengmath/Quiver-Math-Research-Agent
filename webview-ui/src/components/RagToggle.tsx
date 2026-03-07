import React, { useCallback } from 'react'

export interface RagToggleProps {
  readonly enabled: boolean
  readonly onToggle: (enabled: boolean) => void
}

/**
 * Toggle switch for enabling/disabling RAG auto-retrieval.
 * Posts setting change to the extension host.
 */
export function RagToggle({
  enabled,
  onToggle,
}: RagToggleProps): React.ReactElement {
  const handleChange = useCallback(() => {
    onToggle(!enabled)
  }, [enabled, onToggle])

  return (
    <label className="rag-toggle" title="Toggle RAG auto-retrieval">
      <span className="rag-toggle__label">RAG</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={`rag-toggle__switch ${enabled ? 'rag-toggle__switch--on' : ''}`}
        onClick={handleChange}
      >
        <span className="rag-toggle__thumb" />
      </button>
    </label>
  )
}
