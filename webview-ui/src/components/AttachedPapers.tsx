import React, { useCallback, useState } from 'react'
import type { AttachedPaper } from '../types'
import './AttachedPapers.css'

export interface AttachedPapersProps {
  readonly papers: ReadonlyArray<AttachedPaper>
  readonly onAddPaper: () => void
  readonly onRemovePaper: (paperId: string) => void
  readonly onSetScope: (paperId: string, scope: 'global' | 'branch') => void
}

/**
 * Collapsible sidebar section listing attached papers.
 * Shows source badge (arXiv / PDF / TeX), scope badge (Global / Branch),
 * and provides right-click context menu for scope toggle and removal.
 */
export function AttachedPapers({
  papers,
  onAddPaper,
  onRemovePaper,
  onSetScope,
}: AttachedPapersProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    readonly paperId: string
    readonly x: number
    readonly y: number
  } | null>(null)

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, paperId: string) => {
      e.preventDefault()
      setContextMenu({ paperId, x: e.clientX, y: e.clientY })
    },
    []
  )

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handleSetGlobal = useCallback(() => {
    if (contextMenu) {
      onSetScope(contextMenu.paperId, 'global')
      setContextMenu(null)
    }
  }, [contextMenu, onSetScope])

  const handleSetBranch = useCallback(() => {
    if (contextMenu) {
      onSetScope(contextMenu.paperId, 'branch')
      setContextMenu(null)
    }
  }, [contextMenu, onSetScope])

  const handleRemove = useCallback(() => {
    if (contextMenu) {
      onRemovePaper(contextMenu.paperId)
      setContextMenu(null)
    }
  }, [contextMenu, onRemovePaper])

  return (
    <div className="attached-papers">
      <div className="attached-papers__header">
        <button
          type="button"
          className="attached-papers__toggle"
          onClick={handleToggleCollapse}
          aria-expanded={!collapsed}
        >
          <span className={`attached-papers__arrow ${collapsed ? 'attached-papers__arrow--collapsed' : ''}`}>
            {'\u25BE'}
          </span>
          <span className="attached-papers__title">
            Attached Papers{papers.length > 0 ? ` (${papers.length})` : ''}
          </span>
        </button>
        <button
          type="button"
          className="attached-papers__add-btn"
          onClick={onAddPaper}
          title="Add paper"
        >
          +
        </button>
      </div>
      {!collapsed && (
        <div className="attached-papers__list">
          {papers.length === 0 && (
            <div className="attached-papers__empty">
              No papers attached. Click + to add one.
            </div>
          )}
          {papers.map((paper) => (
            <div
              key={paper.id}
              className="attached-papers__item"
              onContextMenu={(e) => handleContextMenu(e, paper.id)}
              title={`Right-click for options\n${paper.title}`}
            >
              <div className="attached-papers__item-header">
                <span className={`attached-papers__source-badge attached-papers__source-badge--${paper.source}`}>
                  {formatSource(paper.source)}
                </span>
                <span className={`attached-papers__scope-badge attached-papers__scope-badge--${paper.scope}`}>
                  {paper.scope === 'global' ? 'Global' : 'Branch'}
                </span>
              </div>
              <div className="attached-papers__item-title">
                {paper.title}
              </div>
            </div>
          ))}
        </div>
      )}
      {contextMenu && (
        <>
          <div
            className="attached-papers__context-overlay"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => {
              e.preventDefault()
              handleCloseContextMenu()
            }}
          />
          <div
            className="attached-papers__context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className="attached-papers__context-item"
              onClick={handleSetGlobal}
            >
              Set scope: Global
            </button>
            <button
              type="button"
              className="attached-papers__context-item"
              onClick={handleSetBranch}
            >
              Set scope: This branch only
            </button>
            <div className="attached-papers__context-divider" />
            <button
              type="button"
              className="attached-papers__context-item attached-papers__context-item--danger"
              onClick={handleRemove}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function formatSource(source: AttachedPaper['source']): string {
  switch (source) {
    case 'arxiv':
      return 'arXiv'
    case 'local-pdf':
      return 'PDF'
    case 'local-tex':
      return 'TeX'
  }
}
