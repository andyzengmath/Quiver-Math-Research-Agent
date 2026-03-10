import { strict as assert } from 'assert'
import * as sinon from 'sinon'
import {
  Lean4Service,
  ExecFileCallback,
  Lean4ServiceDeps,
  FsOps,
} from '../../lean4/service'

/**
 * Creates mock dependencies for Lean4Service.
 * Uses sinon stubs for execFile and fs operations.
 */
function createMockDeps(overrides?: {
  timeoutMs?: number
}): {
  deps: Lean4ServiceDeps
  execFileStub: sinon.SinonStub
  writeFileStub: sinon.SinonStub
  unlinkStub: sinon.SinonStub
} {
  const execFileStub = sinon.stub()
  const writeFileStub = sinon.stub()
  const unlinkStub = sinon.stub()

  // Default: writeFile succeeds
  writeFileStub.callsFake(
    (
      _path: string,
      _data: string,
      _opts: unknown,
      cb: (err: Error | null) => void
    ) => {
      cb(null)
    }
  )

  // Default: unlink succeeds
  unlinkStub.callsFake(
    (_path: string, cb: (err: Error | null) => void) => {
      cb(null)
    }
  )

  const fs: FsOps = {
    writeFile: writeFileStub,
    unlink: unlinkStub,
    tmpdir: () => '/tmp',
  }

  const deps: Lean4ServiceDeps = {
    getConfig: (key: string) => {
      if (key === 'mathAgent.lean4.timeoutMs') {
        return overrides?.timeoutMs ?? 60000
      }
      return undefined
    },
    execFile: execFileStub,
    fs,
  }

  return { deps, execFileStub, writeFileStub, unlinkStub }
}

describe('Lean4Service', () => {
  describe('isAvailable', () => {
    it('returns true when lean --version succeeds', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, 'Lean (version 4.3.0)', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.isAvailable()

      assert.equal(result, true)
    })

    it('returns false when lean --version fails', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          const err = new Error('ENOENT') as Error & { code?: string }
          err.code = 'ENOENT'
          cb(err, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.isAvailable()

      assert.equal(result, false)
    })

    it('returns false when execFile throws synchronously', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.throws(new Error('spawn failed'))

      const service = new Lean4Service(deps)
      const result = await service.isAvailable()

      assert.equal(result, false)
    })
  })

  describe('verify', () => {
    it('returns status success when lean exits with code 0', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const leanCode = 'theorem test : 1 + 1 = 2 := rfl'
      const result = await service.verify(leanCode)

      assert.equal(result.status, 'success')
      assert.deepEqual(result.diagnostics, [])
    })

    it('returns status error with diagnostics when lean exits with non-zero code', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          const err = new Error('Process exited with code 1') as Error & { code?: string }
          err.code = '1'
          cb(err, '', 'error: type mismatch\n  expected: Nat\n  got: String')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.verify('theorem bad : Nat := "hello"')

      assert.equal(result.status, 'error')
      assert.ok(result.diagnostics.length > 0)
      assert.ok(
        result.diagnostics.some((d: string) => d.includes('type mismatch'))
      )
    })

    it('returns status timeout when process exceeds timeout', async () => {
      const { deps, execFileStub } = createMockDeps({ timeoutMs: 100 })
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          const childProc = { kill: sinon.stub() }
          // Simulate timeout: callback with killed=true error
          setTimeout(() => {
            const err = new Error('Process timed out') as Error & {
              killed?: boolean
            }
            err.killed = true
            cb(err, '', '')
          }, 10)
          return childProc
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.verify('-- long running proof')

      assert.equal(result.status, 'timeout')
    })

    it('includes leanCode and verifiedAt in result', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const leanCode = '#check Nat'
      const before = Date.now()
      const result = await service.verify(leanCode)
      const after = Date.now()

      assert.equal(result.leanCode, leanCode)
      assert.ok(
        result.verifiedAt >= before,
        'verifiedAt should be >= time before verify'
      )
      assert.ok(
        result.verifiedAt <= after,
        'verifiedAt should be <= time after verify'
      )
    })

    it('cleans up temp file after successful verification', async () => {
      const { deps, execFileStub, unlinkStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      await service.verify('-- test cleanup')

      assert.ok(unlinkStub.calledOnce, 'temp file should be cleaned up')
    })

    it('cleans up temp file even on error', async () => {
      const { deps, execFileStub, unlinkStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          const err = new Error('exit 1') as Error & { code?: string }
          err.code = '1'
          cb(err, '', 'some error')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      await service.verify('-- failing code')

      assert.ok(
        unlinkStub.calledOnce,
        'temp file should be cleaned up even on error'
      )
    })
  })

  describe('edge cases', () => {
    it('verify handles empty string leanCode', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.verify('')

      assert.equal(result.status, 'success')
      assert.equal(result.leanCode, '')
    })

    it('verify filters empty lines from stderr diagnostics', async () => {
      const { deps, execFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          const err = new Error('exit 1') as Error & { code?: string }
          err.code = '1'
          cb(err, '', 'error line 1\n\nerror line 2\n')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const result = await service.verify('-- bad code')

      assert.equal(result.status, 'error')
      assert.ok(result.diagnostics.every((d: string) => d.length > 0))
    })

    it('uses configured timeout from getConfig', async () => {
      const { deps, execFileStub } = createMockDeps({ timeoutMs: 30000 })
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          opts: { timeout?: number },
          cb: ExecFileCallback
        ) => {
          assert.equal(opts.timeout, 30000, 'should use configured timeout')
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      await service.verify('-- test')
    })

    it('writes lean code to temp file before running lean', async () => {
      const { deps, execFileStub, writeFileStub } = createMockDeps()
      execFileStub.callsFake(
        (
          _cmd: string,
          _args: readonly string[],
          _opts: unknown,
          cb: ExecFileCallback
        ) => {
          cb(null, '', '')
          return { kill: () => {} }
        }
      )

      const service = new Lean4Service(deps)
      const leanCode = 'theorem test : True := trivial'
      await service.verify(leanCode)

      assert.ok(writeFileStub.calledOnce, 'should write to temp file')
      const writtenData = writeFileStub.firstCall.args[1]
      assert.equal(writtenData, leanCode, 'temp file should contain lean code')
      const writtenPath = writeFileStub.firstCall.args[0] as string
      assert.ok(
        writtenPath.startsWith('/tmp/'),
        'temp file should be in tmpdir'
      )
      assert.ok(
        writtenPath.endsWith('.lean'),
        'temp file should have .lean extension'
      )
    })
  })
})
