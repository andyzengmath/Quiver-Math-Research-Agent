/**
 * Node.js module resolution customization hooks.
 * Redirects 'vscode' imports to our mock implementation.
 * Used with --import flag via register().
 */
import { register } from 'node:module'

register('./resolver.mjs', import.meta.url)
