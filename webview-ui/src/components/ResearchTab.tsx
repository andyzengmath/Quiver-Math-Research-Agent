import React, { useState, useCallback } from 'react'
import { MessageList, type Message } from './MessageList'
import { MessageInput } from './MessageInput'
import './MessageList.css'

const INITIAL_MESSAGES: ReadonlyArray<Message> = [
  {
    id: 'mock-1',
    role: 'assistant',
    content:
      'Welcome to Math Research Agent! I can help you explore mathematical concepts. Try asking about a theorem or formula.\n\nFor example, the **Euler identity** is $e^{i\\pi} + 1 = 0$.',
  },
  {
    id: 'mock-2',
    role: 'user',
    content: 'Can you show me the quadratic formula?',
  },
  {
    id: 'mock-3',
    role: 'assistant',
    content:
      'The **quadratic formula** for $ax^2 + bx + c = 0$ is:\n\n$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n\nThis gives both roots of any quadratic equation.',
  },
]

let nextId = 4

export function ResearchTab(): React.ReactElement {
  const [messages, setMessages] = useState<ReadonlyArray<Message>>([...INITIAL_MESSAGES])

  const handleSend = useCallback((text: string) => {
    const userMessage: Message = {
      id: `msg-${nextId++}`,
      role: 'user',
      content: text,
    }
    setMessages((prev) => [...prev, userMessage])
  }, [])

  return (
    <div className="research-tab">
      <MessageList messages={messages} />
      <MessageInput onSend={handleSend} />
    </div>
  )
}
