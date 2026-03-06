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

/** Enum mirroring vscode.LanguageModelChatMessageRole */
const LanguageModelChatMessageRole = {
  User: 1,
  Assistant: 2,
}

class LanguageModelChatMessage {
  constructor(role, content) {
    this.role = role
    this.content = content
  }

  static User(content) {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.User, content)
  }

  static Assistant(content) {
    return new LanguageModelChatMessage(LanguageModelChatMessageRole.Assistant, content)
  }
}

module.exports = {
  CancellationTokenSource,
  LanguageModelChatMessage,
  LanguageModelChatMessageRole,
  lm: {
    selectChatModels: () => Promise.resolve([]),
  },
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
