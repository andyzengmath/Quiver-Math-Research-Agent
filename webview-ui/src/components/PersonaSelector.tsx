import React, { useCallback } from 'react'

export interface PersonaOption {
  readonly id: string
  readonly label: string
}

export interface PersonaSelectorProps {
  readonly personas: ReadonlyArray<PersonaOption>
  readonly selectedId: string
  readonly onSelect: (id: string) => void
}

export function PersonaSelector({
  personas,
  selectedId,
  onSelect,
}: PersonaSelectorProps): React.ReactElement {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSelect(e.target.value)
    },
    [onSelect]
  )

  // Separate multi-agent from other personas
  const regularPersonas = personas.filter((p) => p.id !== 'multi-agent')
  const multiAgent = personas.find((p) => p.id === 'multi-agent')

  return (
    <select
      className="persona-selector"
      value={selectedId}
      onChange={handleChange}
      aria-label="Select math persona"
    >
      {regularPersonas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
      {multiAgent && (
        <option key={multiAgent.id} value={multiAgent.id}>
          {multiAgent.label}
        </option>
      )}
    </select>
  )
}
