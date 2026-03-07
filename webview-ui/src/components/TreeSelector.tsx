import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { TreeListItem } from '../types'

export interface TreeSelectorProps {
  readonly trees: ReadonlyArray<TreeListItem>
  readonly activeTreeId: string | null
  readonly onSelect: (treeId: string) => void
  readonly onCreate: (title: string) => void
  readonly onRename: (treeId: string, title: string) => void
  readonly onDelete: (treeId: string) => void
}

export function TreeSelector({
  trees,
  activeTreeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: TreeSelectorProps): React.ReactElement {
  const [contextMenu, setContextMenu] = useState<{
    readonly treeId: string
    readonly x: number
    readonly y: number
  } | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Sort trees by updatedAt descending
  const sortedTrees = [...trees].sort((a, b) => b.updatedAt - a.updatedAt)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      if (value === '__new__') {
        onCreate('New Research')
      } else {
        onSelect(value)
      }
    },
    [onSelect, onCreate]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, treeId: string) => {
      e.preventDefault()
      setContextMenu({ treeId, x: e.clientX, y: e.clientY })
    },
    []
  )

  const handleRenameStart = useCallback(
    (treeId: string) => {
      const tree = trees.find((t) => t.id === treeId)
      if (tree) {
        setRenamingId(treeId)
        setRenameValue(tree.title)
        setContextMenu(null)
      }
    },
    [trees]
  )

  const handleRenameSubmit = useCallback(() => {
    if (renamingId && renameValue.trim().length > 0) {
      onRename(renamingId, renameValue.trim())
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue, onRename])

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenameSubmit()
      } else if (e.key === 'Escape') {
        setRenamingId(null)
        setRenameValue('')
      }
    },
    [handleRenameSubmit]
  )

  const handleDelete = useCallback(
    (treeId: string) => {
      setContextMenu(null)
      onDelete(treeId)
    },
    [onDelete]
  )

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  if (renamingId) {
    return (
      <div className="tree-selector-rename" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <input
          ref={renameInputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          aria-label="Rename session"
          style={{
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border, var(--vscode-dropdown-border))',
            borderRadius: '2px',
            padding: '2px 4px',
            fontSize: '12px',
            outline: 'none',
            width: '120px',
          }}
        />
      </div>
    )
  }

  return (
    <div className="tree-selector" style={{ display: 'inline-block', position: 'relative' }}>
      <select
        className="tree-selector__dropdown"
        value={activeTreeId ?? ''}
        onChange={handleChange}
        onContextMenu={(e) => {
          const selectedOption = sortedTrees.find(
            (t) => t.id === (e.target as HTMLSelectElement).value
          )
          if (selectedOption) {
            handleContextMenu(e, selectedOption.id)
          }
        }}
        aria-label="Select research session"
        style={{
          background: 'var(--vscode-dropdown-background)',
          color: 'var(--vscode-dropdown-foreground)',
          border: '1px solid var(--vscode-dropdown-border)',
          borderRadius: '2px',
          padding: '2px 4px',
          fontSize: '12px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="__new__">+ New research session</option>
        {sortedTrees.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
          </option>
        ))}
      </select>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="tree-selector__context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--vscode-menu-background, var(--vscode-dropdown-background))',
            color: 'var(--vscode-menu-foreground, var(--vscode-dropdown-foreground))',
            border: '1px solid var(--vscode-menu-border, var(--vscode-dropdown-border))',
            borderRadius: '4px',
            padding: '4px 0',
            zIndex: 1000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            minWidth: '120px',
          }}
        >
          <button
            type="button"
            onClick={() => handleRenameStart(contextMenu.treeId)}
            style={{
              display: 'block',
              width: '100%',
              background: 'transparent',
              color: 'inherit',
              border: 'none',
              padding: '4px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => handleDelete(contextMenu.treeId)}
            style={{
              display: 'block',
              width: '100%',
              background: 'transparent',
              color: 'var(--vscode-errorForeground, #f44)',
              border: 'none',
              padding: '4px 12px',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
