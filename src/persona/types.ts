export interface PersonaConfig {
  readonly id: string
  readonly label: string
  readonly systemPrompt: string
  readonly preferredSources?: ReadonlyArray<'arxiv' | 'nlab' | 'wikipedia'>
}
