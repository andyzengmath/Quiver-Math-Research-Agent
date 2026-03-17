import React from 'react'

export interface PersonaOption {
  readonly id: string
  readonly label: string
}

export interface PersonaSelectorProps {
  readonly personas: ReadonlyArray<PersonaOption>
  readonly selectedId: string
  readonly onSelect: (id: string) => void
  readonly disabled?: boolean
}

export function PersonaSelector({
  personas,
  selectedId,
  onSelect,
  disabled,
}: PersonaSelectorProps): React.ReactElement {
  return (
    <select
      className="persona-selector"
      value={selectedId}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
      title="Math persona"
    >
      {personas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </select>
  )
}
