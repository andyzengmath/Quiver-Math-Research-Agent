# Deployment & Testing Issues Post-Mortem

**Date:** 2026-03-10
**Context:** Issues encountered while trying to run and test the Math Research Agent VS Code extension after implementation was complete.

---

## Issue 1: Extension Development Host (F5) Does Not Launch

**Symptom:** Pressing F5 in VS Code did nothing. No new window, no error.

**Root cause:** Missing `.vscode/launch.json` and `.vscode/tasks.json`. The quantum-loop execution pipeline created the extension code but never generated the VS Code debug configuration files.

**Fix:** Created `.vscode/launch.json` with `extensionHost` configuration and `.vscode/tasks.json` with npm compile task.

**Lesson:** The quantum-loop `ql-plan` should include a story or task for creating `.vscode/launch.json` and `.vscode/tasks.json` as part of the extension scaffold (US-001). Without these, the extension cannot be debugged.

---

## Issue 2: F5 Still Not Working — Corporate Policy Blocks Extension Development Mode

**Symptom:** Even with correct launch.json, F5 either timed out ("Extension host did not start in 10 seconds") or launched an Extension Host window where the extension wasn't loaded.

**Root cause:** Windows 11 Enterprise corporate policy blocks the `--extensionDevelopmentPath` flag used by VS Code's extension development mode. A minimal test extension (1 file, no dependencies) also failed to load via F5, confirming this was an environment issue, not a code issue.

**Fix:** Switched to packaging the extension as a `.vsix` file and installing it via `code --install-extension <file>.vsix`. This bypasses the development mode restriction.

**Lesson:** When targeting enterprise environments, the build pipeline should support VSIX packaging from the start. Add `npm run package` script to package.json that runs esbuild + vsce package.

---

## Issue 3: OneDrive Path with Spaces Causes Silent Failures

**Symptom:** Various tools and commands failed silently when the project was at `C:\Users\andyzeng\OneDrive - Microsoft\Documents\GitHub\Math-research-agent`.

**Root cause:** The space in "OneDrive - Microsoft" caused issues with some command-line tools, path resolution, and VS Code's `--extensionDevelopmentPath` flag.

**Fix:** Cloned the repo to `C:\dev\math-agent` (no spaces in path) for building and packaging.

**Lesson:** For VS Code extension development, always use a path without spaces. Document this in the README.

---

## Issue 4: VSIX Installed But Commands Not Found — Missing npm Dependencies

**Symptom:** Extension installed successfully via VSIX (`code --list-extensions` showed it), but `Ctrl+Shift+P` → "Math Research Agent" returned "command not found".

**Root cause:** The initial VSIX was packaged with `--no-dependencies` and the extension was compiled with `tsc` (TypeScript compiler), which outputs separate `.js` files that use `require()` for npm packages. The npm packages (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`, `cheerio`, `fast-xml-parser`, `uuid`, etc.) were not included in the VSIX, so `require()` calls failed with `MODULE_NOT_FOUND`, crashing `activate()` silently.

**Fix:** Created `esbuild.extension.js` to bundle the extension host code (just like the webview was already bundled with esbuild). This produces a single `out/extension.js` file with all npm dependencies inlined, except `vscode` (which is provided by VS Code).

```javascript
// esbuild.extension.js
esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  external: ['vscode', 'pdf-parse', 'canvas'],
})
```

**Lesson:** VS Code extensions distributed as VSIX MUST bundle their dependencies. Using `tsc` alone is insufficient — it compiles TypeScript but doesn't bundle npm packages. The quantum-loop scaffold story (US-001) should set up esbuild for both the extension host and webview from the start.

---

## Issue 5: DOMMatrix Crash — pdf-parse Pulls In Browser APIs

**Symptom:** Extension still failed to activate after bundling. Mock activation test revealed: `ReferenceError: DOMMatrix is not defined`.

**Root cause:** The `pdf-parse` npm package internally requires canvas/DOM APIs (`DOMMatrix`, `ImageData`, `Path2D`) that only exist in browser environments. When esbuild bundled `pdf-parse` into `out/extension.js`, these browser-only APIs were executed at module load time, crashing the Node.js extension host.

**First fix attempt:** Mark `pdf-parse` as `external` in esbuild config. This prevented bundling but the `require('pdf-parse')` call at the top of `src/papers/manager.ts` still executed at load time, and since `pdf-parse` wasn't in the VSIX `node_modules`, it threw `MODULE_NOT_FOUND`.

**Actual root cause (refined):** The real problem was that `pdf-parse` was imported at the **top level** of `src/papers/manager.ts`:

```typescript
import { PDFParse } from 'pdf-parse'  // Runs at module load time
```

Since `manager.ts` is imported by `paper-handler.ts`, which is imported by `panel.ts`, which is imported by `extension.ts`, this top-level import runs during `activate()` — even if the user never attaches a PDF.

**Final fix:** Changed the top-level `import` to a **lazy dynamic `import()`** inside the method that actually uses it:

```typescript
// Before (crashes at load time):
import { PDFParse } from 'pdf-parse'

// After (only loads when user attaches a PDF):
private async attachPdfFile(filePath: string): Promise<AttachedPaper> {
  const { PDFParse } = await import('pdf-parse')
  // ...
}
```

Combined with keeping `pdf-parse` as `external` in esbuild, this ensures:
- The extension loads without requiring `pdf-parse` at startup
- `pdf-parse` is only loaded when a user actually attaches a PDF file
- If `pdf-parse` is not installed, the error only affects PDF attachment (not the whole extension)

**Lesson:** For VS Code extensions, any dependency that uses browser-only APIs (DOM, Canvas, WebGL) must be lazily imported. The quantum-loop should add a validation step: scan the esbuild bundle for browser-only globals (`DOMMatrix`, `document`, `window.navigator`) and flag them.

---

## Issue 6: Stale esbuild Output — Bundle Didn't Include Latest Code

**Symptom:** After adding debug logging to `extension.ts`, the installed extension still didn't have the log lines. The VSIX seemed to contain an old version.

**Root cause:** Running `node esbuild.extension.js` rebuilt `out/extension.js`, but the previous `tsc` compilation had also written to `out/extension.js`. The esbuild and tsc builds were competing for the same output file. When `npm run compile` (tsc) ran, it overwrote the esbuild bundle with the unbundled tsc output.

**Fix:** Always run `node esbuild.extension.js` as the **last** build step before packaging. The `npm run compile` script (tsc) should either output to a different directory or be replaced by esbuild for production builds.

**Lesson:** The build pipeline needs clear separation: `tsc` for type-checking only (`tsc --noEmit`), esbuild for actual bundling. Add scripts to package.json:

```json
{
  "scripts": {
    "check": "tsc --noEmit",
    "build": "node esbuild.extension.js && node esbuild.webview.js",
    "package": "npm run build && vsce package --allow-missing-repository --skip-license"
  }
}
```

---

## Summary of Root Causes

| Issue | Category | Time Spent | Preventable? |
|-------|----------|-----------|--------------|
| Missing launch.json | Scaffold gap | 10 min | Yes — include in US-001 |
| Corporate policy blocks F5 | Environment | 30 min | Partial — document VSIX workflow |
| OneDrive path spaces | Environment | 15 min | Yes — document in README |
| Missing bundled dependencies | Build pipeline | 45 min | Yes — use esbuild from start |
| pdf-parse DOMMatrix crash | Dependency issue | 30 min | Yes — scan for browser globals |
| Stale esbuild output | Build pipeline | 20 min | Yes — separate tsc and esbuild |

**Total debugging time: ~2.5 hours**

## Recommendations for Quantum-Loop Pipeline

1. **US-001 (scaffold) should include:** `.vscode/launch.json`, `.vscode/tasks.json`, `esbuild.extension.js`, and proper `package.json` scripts for `build`, `check`, and `package`
2. **Add a "packaging" story** that validates the extension loads as a VSIX — not just that it compiles
3. **Add a build validation task** that runs the bundled `out/extension.js` with a mock vscode module and verifies `activate()` succeeds
4. **Scan bundles for browser globals** as a post-build check: `grep -c "DOMMatrix\|document\.\|window\." out/extension.js`
5. **Lazy-import any dependency** that touches browser APIs — enforce this in code review
