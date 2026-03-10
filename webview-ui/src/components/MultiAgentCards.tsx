import React, { useCallback } from 'react'
import { renderMathMarkdown } from '../utils/renderMarkdown'
import type { MultiAgentResponse } from '../hooks/useMultiAgent'
import './MultiAgentCards.css'

export interface MultiAgentCardsProps {
  readonly responses: ReadonlyArray<MultiAgentResponse>
  readonly synthesis: string
  readonly onPromoteToBranch: (personaId: string, content: string) => void
}

function AgentCard({
  response,
  onPromote,
}: {
  readonly response: MultiAgentResponse
  readonly onPromote: (personaId: string, content: string) => void
}): React.ReactElement {
  const rendered = renderMathMarkdown(response.response)

  const handlePromote = useCallback(() => {
    onPromote(response.personaId, response.response)
  }, [onPromote, response.personaId, response.response])

  return (
    <div className="multi-agent-card">
      <div className="multi-agent-card__header">
        <span className="multi-agent-card__label">{response.label}</span>
      </div>
      <div
        className="multi-agent-card__content"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      <div className="multi-agent-card__actions">
        <button
          type="button"
          className="multi-agent-card__promote-btn"
          onClick={handlePromote}
        >
          Promote to branch
        </button>
      </div>
    </div>
  )
}

export function MultiAgentCards({
  responses,
  synthesis,
  onPromoteToBranch,
}: MultiAgentCardsProps): React.ReactElement {
  const synthesisRendered = renderMathMarkdown(synthesis)

  return (
    <div className="multi-agent-container">
      <div className="multi-agent-grid">
        {responses.map((response) => (
          <AgentCard
            key={response.personaId}
            response={response}
            onPromote={onPromoteToBranch}
          />
        ))}
      </div>
      {synthesis && (
        <div className="multi-agent-synthesis">
          <div className="multi-agent-synthesis__header">Synthesis</div>
          <div
            className="multi-agent-synthesis__content"
            dangerouslySetInnerHTML={{ __html: synthesisRendered }}
          />
        </div>
      )}
    </div>
  )
}
