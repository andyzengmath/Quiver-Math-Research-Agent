import React, { useCallback } from 'react'

export interface ProviderOption {
  readonly id: string
  readonly model: string
  readonly label: string
}

export interface ModelSelectorProps {
  readonly providers: ReadonlyArray<ProviderOption>
  readonly selectedProviderId: string
  readonly onSelect: (providerId: string) => void
}

export function ModelSelector({
  providers,
  selectedProviderId,
  onSelect,
}: ModelSelectorProps): React.ReactElement {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSelect(e.target.value)
    },
    [onSelect]
  )

  return (
    <select
      className="model-selector"
      value={selectedProviderId}
      onChange={handleChange}
      aria-label="Select LLM provider"
      style={{
        background: 'var(--vscode-dropdown-background)',
        color: 'var(--vscode-dropdown-foreground)',
        border: '1px solid var(--vscode-dropdown-border)',
        borderRadius: '2px',
        padding: '2px 4px',
        fontSize: '12px',
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {providers.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label} / {p.model}
        </option>
      ))}
    </select>
  )
}
