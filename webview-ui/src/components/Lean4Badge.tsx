import React, { useState, useCallback } from 'react'
import type { Lean4Result } from '../types'
import './Lean4Badge.css'

export interface Lean4BadgeProps {
  readonly lean4Result?: Lean4Result
  readonly lean4Available: boolean
  readonly onVerify: () => void
  readonly onRetry: () => void
}

/**
 * Badge component for Lean4 proof verification, shown below assistant messages.
 * Renders nothing when Lean4 is not available.
 * Shows a "Verify in Lean4" button when no result exists, and appropriate
 * status badges (green/red/yellow) after verification.
 */
export function Lean4Badge({
  lean4Result,
  lean4Available,
  onVerify,
  onRetry,
}: Lean4BadgeProps): React.ReactElement | null {
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false)

  const toggleDiagnostics = useCallback(() => {
    setDiagnosticsExpanded((prev) => !prev)
  }, [])

  if (!lean4Available) {
    return null
  }

  // No result yet: show verify button
  if (!lean4Result) {
    return (
      <div className="lean4-badge">
        <button
          type="button"
          className="lean4-badge__verify-btn"
          onClick={onVerify}
        >
          Verify in Lean4
        </button>
      </div>
    )
  }

  // Success: green badge
  if (lean4Result.status === 'success') {
    return (
      <div className="lean4-badge">
        <span className="lean4-badge__pill lean4-badge__pill--success">
          Verified
        </span>
      </div>
    )
  }

  // Timeout: yellow badge + retry
  if (lean4Result.status === 'timeout') {
    return (
      <div className="lean4-badge">
        <span className="lean4-badge__pill lean4-badge__pill--timeout">
          Timeout
        </span>
        <button
          type="button"
          className="lean4-badge__retry-btn"
          onClick={onRetry}
        >
          Retry
        </button>
      </div>
    )
  }

  // Error: red badge + expandable diagnostics + fix and retry
  return (
    <div className="lean4-badge">
      <span className="lean4-badge__pill lean4-badge__pill--error">
        Failed
      </span>
      {lean4Result.diagnostics.length > 0 && (
        <button
          type="button"
          className="lean4-badge__diagnostics-toggle"
          onClick={toggleDiagnostics}
          title={diagnosticsExpanded ? 'Collapse diagnostics' : 'Expand diagnostics'}
        >
          {diagnosticsExpanded ? '\u25B2' : '\u25BC'} {lean4Result.diagnostics.length} diagnostic{lean4Result.diagnostics.length !== 1 ? 's' : ''}
        </button>
      )}
      <button
        type="button"
        className="lean4-badge__retry-btn"
        onClick={onRetry}
      >
        Fix and retry
      </button>
      {diagnosticsExpanded && lean4Result.diagnostics.length > 0 && (
        <div className="lean4-badge__diagnostics">
          {lean4Result.diagnostics.map((diag, i) => (
            <div key={i} className="lean4-badge__diagnostic-line">
              {diag}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
