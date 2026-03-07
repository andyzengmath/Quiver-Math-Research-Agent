import { useState, useEffect } from 'react'
import type { HostToWebview } from '../types'

export interface MultiAgentResponse {
  readonly personaId: string
  readonly label: string
  readonly response: string
}

export interface UseMultiAgentResult {
  readonly responses: ReadonlyArray<MultiAgentResponse>
  readonly synthesis: string
  readonly isActive: boolean
  readonly clear: () => void
}

/**
 * Hook to handle multiAgentResult messages from the extension host.
 * Stores the latest multi-agent result and exposes it to components.
 */
export function useMultiAgent(lastMessage: HostToWebview | null): UseMultiAgentResult {
  const [responses, setResponses] = useState<ReadonlyArray<MultiAgentResponse>>([])
  const [synthesis, setSynthesis] = useState('')
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (!lastMessage) {
      return
    }

    if (lastMessage.type === 'multiAgentResult') {
      setResponses(lastMessage.responses)
      setSynthesis(lastMessage.synthesis)
      setIsActive(true)
    }

    // When a new regular tree state comes in after a send, clear multi-agent
    // if the user sends a new message (streamChunk resets the display)
    if (lastMessage.type === 'streamChunk') {
      setResponses([])
      setSynthesis('')
      setIsActive(false)
    }
  }, [lastMessage])

  const clear = () => {
    setResponses([])
    setSynthesis('')
    setIsActive(false)
  }

  return { responses, synthesis, isActive, clear }
}
