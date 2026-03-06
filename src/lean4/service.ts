/**
 * Lean4 verification service.
 * Manages interaction with the Lean4 CLI for formal proof verification.
 */
import * as crypto from 'crypto'
import { Lean4Result } from './types'

/**
 * ConfigGetter function type for reading VS Code configuration values.
 * Enables dependency injection for testability.
 */
export type ConfigGetter = (key: string) => unknown

/**
 * Callback-based execFile function signature matching Node.js child_process.execFile.
 */
export type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string
) => void

/**
 * Minimal child process handle returned by execFile.
 */
export interface ChildProcessHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kill: (...args: any[]) => any
}

/**
 * Injected execFile function type.
 * Returns an object with a kill method for timeout handling.
 */
export type ExecFileFn = (
  file: string,
  args: readonly string[],
  options: { timeout?: number },
  callback: ExecFileCallback
) => ChildProcessHandle

/**
 * Injected file system functions for temp file management.
 */
export interface FsOps {
  readonly writeFile: (
    path: string,
    data: string,
    opts: { encoding: BufferEncoding },
    callback: (err: Error | null) => void
  ) => void
  readonly unlink: (
    path: string,
    callback: (err: Error | null) => void
  ) => void
  readonly tmpdir: () => string
}

export interface Lean4ServiceDeps {
  readonly getConfig: ConfigGetter
  readonly execFile: ExecFileFn
  readonly fs: FsOps
}

const AVAILABILITY_TIMEOUT_MS = 5000

export class Lean4Service {
  private readonly deps: Lean4ServiceDeps

  constructor(deps: Lean4ServiceDeps) {
    this.deps = deps
  }

  /**
   * Checks if the Lean4 binary is available on PATH.
   * Runs `lean --version` with a 5-second timeout.
   * Returns true on success, false on any error.
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await new Promise<boolean>((resolve) => {
        try {
          this.deps.execFile(
            'lean',
            ['--version'],
            { timeout: AVAILABILITY_TIMEOUT_MS },
            (error: Error | null) => {
              resolve(error === null)
            }
          )
        } catch {
          resolve(false)
        }
      })
    } catch {
      return false
    }
  }

  /**
   * Verifies Lean4 code by writing it to a temp file and running the Lean CLI.
   *
   * Returns a Lean4Result with:
   * - status: 'success' if exit code 0
   * - status: 'error' if non-zero exit code (diagnostics from stderr)
   * - status: 'timeout' if the process was killed due to timeout
   */
  async verify(leanCode: string): Promise<Lean4Result> {
    const timeoutMs = this.getTimeoutMs()
    const tempPath = this.generateTempPath()

    try {
      await this.writeToFile(tempPath, leanCode)
      const result = await this.runLean(tempPath, timeoutMs, leanCode)
      return result
    } finally {
      await this.cleanupFile(tempPath)
    }
  }

  private getTimeoutMs(): number {
    const configured = this.deps.getConfig('mathAgent.lean4.timeoutMs')
    if (typeof configured === 'number' && configured > 0) {
      return configured
    }
    return 60000
  }

  private generateTempPath(): string {
    const uuid = crypto.randomUUID()
    const tmpdir = this.deps.fs.tmpdir()
    return `${tmpdir}/math-agent-verify-${uuid}.lean`
  }

  private writeToFile(filePath: string, content: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.deps.fs.writeFile(
        filePath,
        content,
        { encoding: 'utf-8' },
        (err: Error | null) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        }
      )
    })
  }

  private runLean(
    filePath: string,
    timeoutMs: number,
    leanCode: string
  ): Promise<Lean4Result> {
    return new Promise<Lean4Result>((resolve) => {
      this.deps.execFile(
        'lean',
        [filePath],
        { timeout: timeoutMs },
        (error: Error | null, _stdout: string, stderr: string) => {
          const verifiedAt = Date.now()

          if (error === null) {
            resolve({
              status: 'success',
              leanCode,
              diagnostics: [],
              verifiedAt,
            })
            return
          }

          const errorWithKilled = error as Error & { killed?: boolean }
          if (errorWithKilled.killed) {
            resolve({
              status: 'timeout',
              leanCode,
              diagnostics: [],
              verifiedAt,
            })
            return
          }

          const diagnostics = stderr
            .split('\n')
            .filter((line) => line.length > 0)

          resolve({
            status: 'error',
            leanCode,
            diagnostics,
            verifiedAt,
          })
        }
      )
    })
  }

  private cleanupFile(filePath: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.deps.fs.unlink(filePath, () => {
        // Always resolve -- cleanup failure should not propagate
        resolve()
      })
    })
  }
}
