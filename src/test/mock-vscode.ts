/**
 * Mock vscode module for unit tests.
 * Provides minimal stubs of VS Code APIs used by the extension.
 */

export class CancellationTokenSource {
  readonly token: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  } as CancellationToken
  cancel(): void {
    (this.token as { isCancellationRequested: boolean }).isCancellationRequested = true
  }
  dispose(): void {}
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean
  readonly onCancellationRequested: (listener: () => void) => { dispose: () => void }
}

export class SecretStorage {
  private readonly store = new Map<string, string>()

  async get(key: string): Promise<string | undefined> {
    return this.store.get(key)
  }

  async store_value(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}

export interface Memento {
  keys(): readonly string[]
  get<T>(key: string): T | undefined
  get<T>(key: string, defaultValue: T): T
  update(key: string, value: unknown): Thenable<void>
}

export interface ExtensionContext {
  readonly secrets: {
    get(key: string): Thenable<string | undefined>
    store(key: string, value: string): Thenable<void>
    delete(key: string): Thenable<void>
  }
  readonly globalState: Memento
  readonly subscriptions: { dispose: () => void }[]
}

export function createMockMemento(): Memento {
  const store = new Map<string, unknown>()
  return {
    keys: () => Array.from(store.keys()),
    get<T>(key: string, defaultValue?: T): T | undefined {
      if (store.has(key)) {
        return store.get(key) as T
      }
      return defaultValue
    },
    async update(key: string, value: unknown): Promise<void> {
      store.set(key, value)
    },
  }
}

export function createMockExtensionContext(): ExtensionContext {
  const secretStore = new Map<string, string>()
  return {
    secrets: {
      get: (key: string) => Promise.resolve(secretStore.get(key)),
      store: (key: string, value: string) => {
        secretStore.set(key, value)
        return Promise.resolve()
      },
      delete: (key: string) => {
        secretStore.delete(key)
        return Promise.resolve()
      },
    },
    globalState: createMockMemento(),
    subscriptions: [],
  }
}
