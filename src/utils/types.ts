/**
 * Generic function type for reading typed configuration values.
 * Used by PersonaManager for dependency injection.
 */
export type ConfigGetter = <T>(key: string, defaultValue?: T) => T | undefined

/**
 * Simple function type for reading raw configuration values.
 * Used by Lean4Service for dependency injection.
 */
export type RawConfigGetter = (key: string) => unknown
