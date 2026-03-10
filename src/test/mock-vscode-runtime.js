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

class ThemeIcon {
  constructor(id) {
    this.id = id
  }
}

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
}

module.exports = {
  CancellationTokenSource,
  ConfigurationTarget,
  LanguageModelChatMessage,
  LanguageModelChatMessageRole,
  ThemeIcon,
  lm: {
    selectChatModels: () => Promise.resolve([]),
  },
  chat: {
    createChatParticipant: () => ({
      iconPath: undefined,
      dispose: () => {},
    }),
  },
  window: {
    showInformationMessage: () => Promise.resolve(undefined),
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showQuickPick: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} }),
  },
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
      update: () => Promise.resolve(),
      inspect: () => ({
        key: '',
        defaultValue: undefined,
        globalValue: undefined,
        workspaceValue: undefined,
        workspaceFolderValue: undefined,
      }),
    }),
  },
}
