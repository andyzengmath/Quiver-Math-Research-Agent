import React, { useRef, useEffect } from 'react'

export interface BreadcrumbSegment {
  readonly nodeId: string
  readonly label: string
}

export interface BreadcrumbProps {
  readonly path: ReadonlyArray<BreadcrumbSegment>
  readonly onNavigate: (nodeId: string) => void
}

function truncateLabel(label: string): string {
  if (label.length <= 30) {
    return label
  }
  return label.slice(0, 30) + '\u2026'
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the right end when path changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = containerRef.current.scrollWidth
    }
  }, [path])

  if (path.length === 0) {
    return <div className="breadcrumb-bar" />
  }

  return (
    <div className="breadcrumb-bar" ref={containerRef}>
      {path.map((segment, index) => {
        const isLast = index === path.length - 1
        return (
          <span key={segment.nodeId} className="breadcrumb-segment-wrapper">
            <button
              type="button"
              className={`breadcrumb-segment ${isLast ? 'breadcrumb-segment--active' : ''}`}
              onClick={() => onNavigate(segment.nodeId)}
              title={segment.label}
            >
              {truncateLabel(segment.label)}
            </button>
            {!isLast && (
              <span className="breadcrumb-separator" aria-hidden="true">
                &gt;
              </span>
            )}
          </span>
        )
      })}
    </div>
  )
}
