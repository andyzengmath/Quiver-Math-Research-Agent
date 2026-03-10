import React, { useState, useCallback } from 'react'
import { ContextMenu } from './ContextMenu'

export interface BranchCardProps {
  readonly nodeId: string
  readonly label: string
  readonly isActive: boolean
  readonly childCount: number
  readonly onSwitch: (nodeId: string) => void
  readonly onDeleteBranch: (nodeId: string) => void
}

export function BranchCard({
  nodeId,
  label,
  isActive,
  childCount,
  onSwitch,
  onDeleteBranch,
}: BranchCardProps): React.ReactElement {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    []
  )

  const handleDelete = useCallback(() => {
    if (childCount > 0) {
      const confirmed = window.confirm(
        `This branch has ${childCount} sub-branches. Delete all?`
      )
      if (!confirmed) {
        return
      }
    }

    onDeleteBranch(nodeId)
  }, [nodeId, childCount, onDeleteBranch])

  const handleCloseMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleClick = useCallback(() => {
    onSwitch(nodeId)
  }, [nodeId, onSwitch])

  return (
    <div
      className={`branch-card ${isActive ? 'branch-card-active' : ''}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick()
        }
      }}
    >
      <span className="branch-card-label">{label}</span>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[{ label: 'Delete branch', onClick: handleDelete }]}
          onClose={handleCloseMenu}
        />
      )}
    </div>
  )
}
