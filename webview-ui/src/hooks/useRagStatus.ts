import { useState, useEffect, useCallback } from 'react'
import type { HostToWebview, RagStatus } from '../types'

export interface UseRagStatusResult {
  /** Map from nodeId to the RAG status for that node */
  readonly ragStatusByNode: ReadonlyMap<string, RagStatus>
  /** Dismiss a citation by URL from a specific node's RAG status */
  readonly dismissCitation: (nodeId: string, url: string) => void
}

export function useRagStatus(lastMessage: HostToWebview | null): UseRagStatusResult {
  const [ragStatusByNode, setRagStatusByNode] = useState<ReadonlyMap<string, RagStatus>>(
    new Map()
  )

  useEffect(() => {
    if (lastMessage && lastMessage.type === 'ragStatus') {
      setRagStatusByNode((prev) => {
        const next = new Map(prev)
        next.set(lastMessage.nodeId, lastMessage.status)
        return next
      })
    }
  }, [lastMessage])

  const dismissCitation = useCallback((nodeId: string, url: string) => {
    setRagStatusByNode((prev) => {
      const status = prev.get(nodeId)
      if (!status || !status.citations) {
        return prev
      }

      const filtered = status.citations.filter((c) => c.url !== url)
      const next = new Map(prev)

      if (filtered.length === 0) {
        // No citations left -- remove the entry entirely
        next.delete(nodeId)
      } else {
        next.set(nodeId, {
          ...status,
          citations: filtered,
        })
      }

      return next
    })
  }, [])

  return { ragStatusByNode, dismissCitation }
}
