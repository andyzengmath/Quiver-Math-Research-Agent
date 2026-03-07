import React, { useCallback } from 'react'

export interface BranchCardProps {
  readonly nodeId: string
  readonly previewText: string
  readonly childCount: number
  readonly isActive: boolean
  readonly onClick: (nodeId: string) => void
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.slice(0, maxLength) + '...'
}

export function BranchCard({
  nodeId,
  previewText,
  childCount,
  isActive,
  onClick,
}: BranchCardProps): React.ReactElement {
  const handleClick = useCallback(() => {
    onClick(nodeId)
  }, [nodeId, onClick])

  const displayText = truncateText(previewText.split('\n')[0] || '(empty)', 50)

  return (
    <button
      type="button"
      className={`branch-card ${isActive ? 'branch-card-active' : 'branch-card-inactive'}`}
      onClick={handleClick}
      title={isActive ? 'Current branch' : 'Switch to this branch'}
      aria-label={`Branch: ${displayText}`}
    >
      <span className="branch-card-preview">{displayText}</span>
      {childCount > 0 && (
        <span className="branch-card-badge">{childCount}</span>
      )}
    </button>
  )
}
