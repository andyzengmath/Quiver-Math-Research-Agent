import React, { useState, useCallback } from 'react'
import { renderMathMarkdown, renderPlainMarkdown } from '../utils/renderMarkdown'
import { ContextMenu } from './ContextMenu'

export interface MessageBubbleProps {
  readonly role: 'user' | 'assistant'
  readonly content: string
  readonly nodeId?: string
  readonly childCount?: number
  readonly onDeleteBranch?: (nodeId: string) => void
  readonly onFork?: (nodeId: string) => void
  readonly isStreaming?: boolean
  readonly isStreamingGlobal?: boolean
  readonly onExportMarkdown?: (nodeId: string) => void
  readonly onExportHtml?: (nodeId: string) => void
}

export function MessageBubble({
  role,
  content,
  nodeId,
  childCount,
  onDeleteBranch,
  onFork,
  isStreaming,
  isStreamingGlobal,
  onExportMarkdown,
  onExportHtml,
}: MessageBubbleProps): React.ReactElement {
  // During streaming, use plain markdown to avoid KaTeX errors from incomplete LaTeX
  const rendered = isStreaming ? renderPlainMarkdown(content) : renderMathMarkdown(content)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!nodeId || !onDeleteBranch) {
        return
      }
      event.preventDefault()
      setContextMenu({ x: event.clientX, y: event.clientY })
    },
    [nodeId, onDeleteBranch]
  )

  const handleDelete = useCallback(() => {
    if (!nodeId || !onDeleteBranch) {
      return
    }

    const descendantCount = childCount ?? 0
    if (descendantCount > 0) {
      const confirmed = window.confirm(
        `This branch has ${descendantCount} sub-branches. Delete all?`
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

  const handleFork = useCallback(() => {
    if (nodeId && onFork) {
      onFork(nodeId)
    }
  }, [nodeId, onFork])

  const handleExportMarkdown = useCallback(() => {
    if (nodeId && onExportMarkdown) {
      onExportMarkdown(nodeId)
    }
  }, [nodeId, onExportMarkdown])

  const handleExportHtml = useCallback(() => {
    if (nodeId && onExportHtml) {
      onExportHtml(nodeId)
    }
  }, [nodeId, onExportHtml])

  const contextMenuItems = React.useMemo(() => {
    const items: Array<{ readonly label: string; readonly onClick: () => void }> = [
      { label: 'Delete branch', onClick: handleDelete },
    ]

    if (!isStreamingGlobal && nodeId) {
      if (onExportMarkdown) {
        items.push({ label: 'Export from here (Markdown)', onClick: handleExportMarkdown })
      }
      if (onExportHtml) {
        items.push({ label: 'Export from here (HTML)', onClick: handleExportHtml })
      }
    }

    return items
  }, [handleDelete, isStreamingGlobal, nodeId, onExportMarkdown, onExportHtml, handleExportMarkdown, handleExportHtml])

  return (
    <div
      className={`message-bubble ${role === 'user' ? 'user-message' : 'assistant-message'}`}
      onContextMenu={handleContextMenu}
    >
      <div
        className="message-content"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      {nodeId && onFork && (
        <button
          className="fork-button"
          onClick={handleFork}
          title="Branch from here"
          type="button"
        >
          &#x2442;
        </button>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={handleCloseMenu}
        />
      )}
    </div>
  )
}
