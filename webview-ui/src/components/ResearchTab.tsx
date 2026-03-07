import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageList, type Message } from './MessageList'
import { MessageInput } from './MessageInput'
import { PersonaSelector, type PersonaOption } from './PersonaSelector'
import { useWebviewMessage } from '../hooks/useWebviewMessage'
import { useTreeState } from '../hooks/useTreeState'
import { useStreaming } from '../hooks/useStreaming'
import type { PersonaConfig } from '../types'
import './MessageList.css'

export function ResearchTab(): React.ReactElement {
  const { lastMessage, postMessage } = useWebviewMessage()
  const { tree, messages: treeMessages } = useTreeState(lastMessage)
  const { streamingNodeId, streamingText, isStreaming } = useStreaming(lastMessage)

  const [personas, setPersonas] = useState<ReadonlyArray<PersonaConfig>>([])

  // On mount, request current state from extension host
  useEffect(() => {
    postMessage({ type: 'requestState' })
  }, [postMessage])

  // Listen for personas message
  useEffect(() => {
    if (lastMessage && lastMessage.type === 'personas') {
      setPersonas(lastMessage.personas)
    }
  }, [lastMessage])

  const selectedPersonaId = tree?.activePersona ?? ''

  const personaOptions = useMemo<ReadonlyArray<PersonaOption>>(() => {
    return personas.map((p) => ({ id: p.id, label: p.label }))
  }, [personas])

  const handlePersonaSelect = useCallback(
    (id: string) => {
      postMessage({ type: 'setPersona', personaId: id })
    },
    [postMessage]
  )

  const handleSend = useCallback(
    (text: string) => {
      postMessage({ type: 'send', content: text })
    },
    [postMessage]
  )

  const handleStop = useCallback(() => {
    postMessage({ type: 'stopStream' })
  }, [postMessage])

  // Build the display messages: tree messages + streaming assistant bubble
  const displayMessages = useMemo<ReadonlyArray<Message>>(() => {
    const msgs: Message[] = treeMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }))

    // If currently streaming, add/replace the streaming assistant message
    if (streamingNodeId && streamingText) {
      // Check if the streaming node is already in the tree messages
      const existingIndex = msgs.findIndex((m) => m.id === streamingNodeId)
      if (existingIndex >= 0) {
        // Replace with live streaming version
        msgs[existingIndex] = {
          id: streamingNodeId,
          role: 'assistant',
          content: streamingText,
        }
      } else {
        // Append as a new message
        msgs.push({
          id: streamingNodeId,
          role: 'assistant',
          content: streamingText,
        })
      }
    }

    return msgs
  }, [treeMessages, streamingNodeId, streamingText])

  return (
    <div className="research-tab">
      {personaOptions.length > 0 && (
        <div className="research-tab-header">
          <PersonaSelector
            personas={personaOptions}
            selectedId={selectedPersonaId}
            onSelect={handlePersonaSelect}
          />
        </div>
      )}
      <MessageList messages={displayMessages} />
      <div className="input-area">
        {isStreaming && (
          <button
            type="button"
            className="stop-button"
            onClick={handleStop}
          >
            Stop
          </button>
        )}
        <MessageInput onSend={handleSend} />
      </div>
    </div>
  )
}
