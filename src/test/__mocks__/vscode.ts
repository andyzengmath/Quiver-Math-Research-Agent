// Mock for vscode module used in unit tests

let configValues: Record<string, unknown> = {}

export function __setMockConfig(values: Record<string, unknown>): void {
  configValues = { ...values }
}

export function __resetMockConfig(): void {
  configValues = {}
}

export const workspace = {
  getConfiguration: (section?: string) => {
    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const fullKey = section ? `${section}.${key}` : key
        if (fullKey in configValues) {
          return configValues[fullKey] as T
        }
        return defaultValue
      },
    }
  },
}

export const window = {
  showInformationMessage: (): undefined => undefined,
  showErrorMessage: (): undefined => undefined,
}

export const commands = {
  registerCommand: (): { dispose: () => void } => ({ dispose: () => {} }),
}

export const Uri = {
  parse: (value: string) => ({ toString: () => value }),
}
