import React, { useState, useCallback } from 'react'

export interface MessageInputProps {
  readonly onSend: (text: string) => void
}

export function MessageInput({ onSend }: MessageInputProps): React.ReactElement {
  const [text, setText] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed) {
      onSend(trimmed)
      setText('')
    }
  }, [text, onSend])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  return (
    <div className="message-input-container">
      <textarea
        className="message-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message... (Shift+Enter for newline)"
        rows={2}
      />
      <button
        className="message-send-button"
        type="button"
        onClick={handleSend}
        disabled={!text.trim()}
      >
        Send
      </button>
    </div>
  )
}
