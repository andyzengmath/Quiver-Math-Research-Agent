/**
 * Module resolution hook for tests.
 * Intercepts 'vscode' module imports and provides a mock.
 * Works with both CommonJS require() and ESM import().
 */
const Module = require('module')
const path = require('path')

const mockVscodePath = path.join(__dirname, 'mock-vscode-runtime.js')

// Hook CommonJS require
const originalResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return mockVscodePath
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

// Pre-load the mock into require.cache with the 'vscode' key
// This ensures that even if something tries to load 'vscode' differently, it gets our mock
const mockModule = require(mockVscodePath)
const fakeVscodeModule = new Module('vscode')
fakeVscodeModule.exports = mockModule
fakeVscodeModule.loaded = true
Module._cache['vscode'] = fakeVscodeModule
