import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageBubble } from '../../components/MessageBubble'

describe('MessageBubble', () => {
  it('renders user message with user-message class', () => {
    const { container } = render(
      <MessageBubble role="user" content="Hello world" />
    )
    const bubble = container.querySelector('.message-bubble')
    expect(bubble).toHaveClass('user-message')
    expect(bubble).not.toHaveClass('assistant-message')
  })

  it('renders assistant message with assistant-message class', () => {
    const { container } = render(
      <MessageBubble role="assistant" content="Hello user" />
    )
    const bubble = container.querySelector('.message-bubble')
    expect(bubble).toHaveClass('assistant-message')
    expect(bubble).not.toHaveClass('user-message')
  })

  it('renders plain text content', () => {
    render(<MessageBubble role="user" content="Simple text" />)
    expect(screen.getByText('Simple text')).toBeInTheDocument()
  })

  it('renders markdown content as HTML', () => {
    const { container } = render(
      <MessageBubble role="assistant" content="**bold text**" />
    )
    const strong = container.querySelector('strong')
    expect(strong).toBeInTheDocument()
    expect(strong?.textContent).toBe('bold text')
  })

  it('renders inline LaTeX via KaTeX without crashing', () => {
    const { container } = render(
      <MessageBubble role="assistant" content="The formula $E = mc^2$ is famous." />
    )
    const katexSpan = container.querySelector('.katex')
    expect(katexSpan).toBeInTheDocument()
  })

  it('renders display LaTeX via KaTeX without crashing', () => {
    const { container } = render(
      <MessageBubble role="assistant" content={'$$\\frac{a}{b}$$'} />
    )
    const katexSpan = container.querySelector('.katex')
    expect(katexSpan).toBeInTheDocument()
  })

  it('renders malformed LaTeX as error text without crashing', () => {
    const { container } = render(
      <MessageBubble role="assistant" content="Broken: $\\invalid{command$" />
    )
    // Should render without throwing - malformed LaTeX shows as error span
    const errorSpan = container.querySelector('.katex-error')
    // With throwOnError: false, KaTeX renders an error span
    expect(errorSpan).toBeInTheDocument()
  })

  it('handles empty content gracefully', () => {
    const { container } = render(
      <MessageBubble role="user" content="" />
    )
    const bubble = container.querySelector('.message-bubble')
    expect(bubble).toBeInTheDocument()
  })
})
