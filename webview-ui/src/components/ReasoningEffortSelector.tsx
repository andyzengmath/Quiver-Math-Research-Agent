import React from 'react'

const EFFORT_LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
] as const

export interface ReasoningEffortSelectorProps {
  readonly selectedEffort: string
  readonly onSelect: (effort: string) => void
  readonly disabled?: boolean
}

export function ReasoningEffortSelector({
  selectedEffort,
  onSelect,
  disabled,
}: ReasoningEffortSelectorProps): React.ReactElement {
  return (
    <select
      className="reasoning-effort-selector"
      value={selectedEffort}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      title="Reasoning effort"
    >
      {EFFORT_LEVELS.map((level) => (
        <option key={level.value} value={level.value}>
          {level.label}
        </option>
      ))}
    </select>
  )
}
