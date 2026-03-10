import { useState, useEffect, useRef, useCallback } from 'react'
import type { HostToWebview } from '../types'

const DEBOUNCE_MS = 100

export interface UseStreamingResult {
  readonly streamingNodeId: string | null
  readonly streamingText: string
  readonly isStreaming: boolean
}

export function useStreaming(lastMessage: HostToWebview | null): UseStreamingResult {
  const [streamingNodeId, setStreamingNodeId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')

  // Use a ref for the accumulated raw text so we can debounce state updates
  const accumulatedRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodeIdRef = useRef<string | null>(null)

  const flush = useCallback(() => {
    setStreamingText(accumulatedRef.current)
  }, [])

  useEffect(() => {
    if (!lastMessage) {
      return
    }

    if (lastMessage.type === 'streamChunk') {
      const { nodeId, text } = lastMessage

      // If this is the first chunk (new stream), reset
      if (nodeIdRef.current !== nodeId) {
        nodeIdRef.current = nodeId
        accumulatedRef.current = ''
        setStreamingNodeId(nodeId)
      }

      accumulatedRef.current += text

      // Debounce the re-render
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        flush()
        timerRef.current = null
      }, DEBOUNCE_MS)
    }

    if (lastMessage.type === 'streamEnd') {
      // Flush any remaining buffered text
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      flush()

      // Clear streaming state
      setStreamingNodeId(null)
      setStreamingText('')
      accumulatedRef.current = ''
      nodeIdRef.current = null
    }
  }, [lastMessage, flush])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    streamingNodeId,
    streamingText,
    isStreaming: streamingNodeId !== null,
  }
}
