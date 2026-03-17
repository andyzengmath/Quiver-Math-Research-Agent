import { useState, useEffect, useRef, useCallback } from 'react'
import type { HostToWebview } from '../types'

const DEBOUNCE_MS = 250

export interface UseStreamingResult {
  readonly streamingNodeId: string | null
  readonly streamingText: string
  readonly isStreaming: boolean
  readonly thinkingMessage: string | null
  readonly thinkingSeconds: number
}

export function useStreaming(lastMessage: HostToWebview | null): UseStreamingResult {
  const [streamingNodeId, setStreamingNodeId] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [thinkingMessage, setThinkingMessage] = useState<string | null>(null)
  const [thinkingSeconds, setThinkingSeconds] = useState(0)

  // Use a ref for the accumulated raw text so we can debounce state updates
  const accumulatedRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodeIdRef = useRef<string | null>(null)
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const thinkingStartRef = useRef<number>(0)

  const flush = useCallback(() => {
    setStreamingText(accumulatedRef.current)
  }, [])

  const stopThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current !== null) {
      clearInterval(thinkingTimerRef.current)
      thinkingTimerRef.current = null
    }
    setThinkingMessage(null)
    setThinkingSeconds(0)
  }, [])

  useEffect(() => {
    if (!lastMessage) {
      return
    }

    if (lastMessage.type === 'streamStart') {
      // Show thinking message with timer
      setThinkingMessage(lastMessage.thinkingMessage)
      thinkingStartRef.current = Date.now()
      setThinkingSeconds(0)

      // Update timer every second
      if (thinkingTimerRef.current !== null) {
        clearInterval(thinkingTimerRef.current)
      }
      thinkingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - thinkingStartRef.current) / 1000)
        setThinkingSeconds(elapsed)
      }, 1000)
    }

    if (lastMessage.type === 'streamChunk') {
      const { nodeId, text } = lastMessage

      // First real chunk arrives — stop thinking indicator (with minimum display of 1s)
      const elapsed = Date.now() - thinkingStartRef.current
      if (elapsed >= 1000) {
        stopThinkingTimer()
      } else if (thinkingMessage) {
        // Delay clearing until at least 1 second has passed
        setTimeout(() => stopThinkingTimer(), 1000 - elapsed)
      }

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
      stopThinkingTimer()

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
  }, [lastMessage, flush, stopThinkingTimer])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
      if (thinkingTimerRef.current !== null) {
        clearInterval(thinkingTimerRef.current)
      }
    }
  }, [])

  return {
    streamingNodeId,
    streamingText,
    isStreaming: streamingNodeId !== null || thinkingMessage !== null,
    thinkingMessage,
    thinkingSeconds,
  }
}
