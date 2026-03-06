export interface Lean4Result {
  status: 'success' | 'error' | 'timeout'
  leanCode: string
  diagnostics: string[]
  verifiedAt: number
}
