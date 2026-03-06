/**
 * Custom ESM resolver that redirects 'vscode' to our mock.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mockVscodeUrl = pathToFileURL(
  path.join(__dirname, 'mock-vscode-runtime.js')
).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'vscode') {
    return {
      shortCircuit: true,
      url: mockVscodeUrl,
      format: 'commonjs',
    }
  }
  return nextResolve(specifier, context)
}
