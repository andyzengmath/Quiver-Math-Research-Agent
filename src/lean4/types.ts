/**
 * Types for Lean4 formal verification integration.
 */

export interface Lean4Result {
  readonly status: 'success' | 'error' | 'timeout'
  readonly leanCode: string
  readonly diagnostics: readonly string[]
  readonly verifiedAt: number
}
