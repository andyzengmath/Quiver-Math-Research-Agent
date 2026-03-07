import React, { useEffect, useRef, useCallback } from 'react'

export interface ContextMenuItem {
  readonly label: string
  readonly onClick: () => void
}

export interface ContextMenuProps {
  readonly x: number
  readonly y: number
  readonly items: ReadonlyArray<ContextMenuItem>
  readonly onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [handleClickOutside])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ position: 'fixed', left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className="context-menu-item"
          onClick={() => {
            item.onClick()
            onClose()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
