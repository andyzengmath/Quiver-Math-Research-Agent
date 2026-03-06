/**
 * Runtime mock for the 'vscode' module.
 * This file is loaded when tests import 'vscode'.
 */

class CancellationTokenSource {
  constructor() {
    this.token = {
      isCancellationRequested: false,
      onCancellationRequested: () => ({ dispose: () => {} }),
    }
  }
  cancel() {
    this.token.isCancellationRequested = true
  }
  dispose() {}
}

module.exports = {
  CancellationTokenSource,
  window: {
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      update: () => Promise.resolve(),
    }),
  },
}
