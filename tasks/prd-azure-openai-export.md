# PRD: Azure OpenAI Support + Chat Export

## 1. Introduction/Overview

This update adds two features to the Quiver: Math Research Agent extension. First, an Azure OpenAI provider that supports both API key and Microsoft Entra Managed Identity authentication, with deployment auto-discovery from the Azure endpoint and interactive browser login fallback. Second, a chat export feature that lets users save research conversations as Markdown (with raw LaTeX) or self-contained HTML (with KaTeX-rendered math and CDN-linked fonts) for sharing and archival.

## 2. Goals

- Enable enterprise users on Azure to use their Azure OpenAI deployments with the extension
- Support two Azure auth modes: API key for simplicity, Managed Identity + browser login for enterprise SSO
- Auto-discover available deployments from an Azure endpoint to prevent typos and improve UX
- Allow users to export any conversation (active branch, full tree, or from a specific message) as Markdown or HTML
- Markdown exports preserve raw LaTeX for rendering in VS Code's markdown preview
- HTML exports render math via KaTeX and can be printed to PDF from any browser

## 3. User Stories

### US-035: Azure OpenAI Provider — Types and Settings

**Description:** As a developer, I want the Azure OpenAI settings registered in package.json so that users can configure their Azure endpoint, deployment, and auth method.

**Acceptance Criteria:**
- [ ] package.json contributes.configuration includes: `mathAgent.llm.azureEndpoint` (string, default ""), `mathAgent.llm.azureDeployment` (string, default ""), `mathAgent.llm.azureAuthMethod` (enum: "api-key"|"managed-identity", default "api-key"), `mathAgent.llm.azureApiVersion` (string, default "2024-12-01-preview")
- [ ] `azure-openai` added to the `mathAgent.llm.provider` enum in package.json
- [ ] Typecheck/lint passes

---

### US-036: Azure OpenAI Provider — API Key Authentication

**Description:** As a user with an Azure OpenAI API key, I want to connect to my Azure deployment so that I can use Azure-hosted models.

**Acceptance Criteria:**
- [ ] `AzureOpenAiProvider` class implements `LlmProvider` interface with `id = 'azure-openai'`
- [ ] Reads API key from SecretStorage with key `azure-openai-api-key`
- [ ] Uses `AzureOpenAI` class from `openai` npm package with `apiKey`, `endpoint` from settings, and `deployment` as the model
- [ ] Reads `azureEndpoint`, `azureDeployment`, `azureApiVersion` from VS Code configuration
- [ ] Streaming yields chunks from `response.choices[0]?.delta?.content` (same pattern as OpenAI provider)
- [ ] When API key is missing, throws `LlmAuthError` with provider `'azure-openai'`
- [ ] When endpoint or deployment is empty, throws `LlmAuthError` with descriptive message
- [ ] Maps Azure-specific 401 errors to `LlmAuthError` and 429 errors to `LlmRateLimitError`
- [ ] Passes `reasoningEffort` from options if set (same as OpenAI provider)
- [ ] Unit tests with mocked AzureOpenAI client cover: streaming, auth error, rate limit, missing endpoint, missing deployment
- [ ] Typecheck/lint passes

---

### US-037: Azure OpenAI Provider — Managed Identity Authentication

**Description:** As an enterprise user on Azure, I want to authenticate via Managed Identity or browser login so that I don't need to manage API keys.

**Acceptance Criteria:**
- [ ] When `mathAgent.llm.azureAuthMethod` is `managed-identity`, the provider uses `@azure/identity` to get a bearer token
- [ ] `@azure/identity` is lazy-imported (dynamic `import()`) to avoid bundling issues — only loaded when managed-identity auth is selected
- [ ] Uses `DefaultAzureCredential` as the primary credential source (covers environment vars, managed identity, Azure CLI)
- [ ] If `DefaultAzureCredential` fails with `CredentialUnavailableError`, falls back to `InteractiveBrowserCredential` which opens a browser window for OAuth login
- [ ] The token is passed to `AzureOpenAI` client via the `azureADTokenProvider` callback option
- [ ] Token scope is `https://cognitiveservices.azure.com/.default`
- [ ] When all credential sources fail, throws `LlmAuthError` with message: "Azure authentication failed. Please run 'az login' or sign in via the browser prompt."
- [ ] Unit tests cover: successful DefaultAzureCredential path, fallback to InteractiveBrowserCredential, complete auth failure
- [ ] Typecheck/lint passes

---

### US-038: Azure OpenAI Provider — Wire into Services and Model Selector

**Description:** As a user, I want Azure OpenAI to appear as a provider option in the model selector so that I can switch to it during a session.

**Acceptance Criteria:**
- [ ] `AzureOpenAiProvider` instantiated and registered in `createServices()` in `src/services.ts`
- [ ] The `requestState` handler in `panel.ts` includes `azure-openai` in the providers list when endpoint and deployment are configured (non-empty)
- [ ] Model selector dropdown shows "Azure OpenAI / {deployment-name}" when configured
- [ ] Selecting `azure-openai` in model selector calls `llm.setProvider('azure-openai')` and subsequent messages use the Azure provider
- [ ] Typecheck/lint passes

---

### US-039: Azure OpenAI — Deployment Auto-Discovery

**Description:** As a user configuring Azure OpenAI, I want to see a list of available deployments so that I don't have to type deployment names manually.

**Acceptance Criteria:**
- [ ] `listAzureDeployments(endpoint, apiKey?, tokenProvider?)` function sends `GET {endpoint}/openai/deployments?api-version={version}` with appropriate auth header
- [ ] Returns array of `{name: string, model: string, status: string}` parsed from the API response
- [ ] When API call succeeds, the onboarding wizard shows a QuickPick with entries formatted as `{name} ({model}) -- {status}`
- [ ] When API call fails (network error, 403 forbidden, etc.), falls back to a manual text input box with warning: "Could not list deployments. Enter the deployment name manually."
- [ ] A test API call validates the selected deployment exists by sending a minimal request to `{endpoint}/openai/deployments/{name}/chat/completions?api-version={version}`
- [ ] If validation fails, shows error and allows re-selection
- [ ] Typecheck/lint passes

---

### US-040: Azure OpenAI — Onboarding Wizard Flow

**Description:** As a new user, I want the onboarding wizard to guide me through Azure OpenAI setup so that I can configure endpoint, auth, and deployment interactively.

**Acceptance Criteria:**
- [ ] "Azure OpenAI" appears as the 5th option in the onboarding provider picker (after Google)
- [ ] Step 1: Input box for endpoint URL with placeholder `https://my-resource.openai.azure.com/` — validates URL starts with `https://`
- [ ] Step 2: QuickPick for auth method: "API Key" / "Managed Identity (Microsoft Entra)"
- [ ] Step 3a (if API Key): Secure input box for API key, stored in SecretStorage under `azure-openai-api-key`
- [ ] Step 3b (if Managed Identity): Shows info message about DefaultAzureCredential + browser fallback
- [ ] Step 4: Calls `listAzureDeployments()` with the configured auth — shows QuickPick of available deployments. Falls back to manual input on failure.
- [ ] Step 5: Test connection by sending a simple prompt to the selected deployment. On success: saves endpoint, deployment, auth method, and api-version to VS Code settings, marks onboarding complete. On failure: shows error with "Try again" / "Skip"
- [ ] Cancelling at any step returns without saving
- [ ] Typecheck/lint passes

---

### US-041: Chat Export — Markdown Builder

**Description:** As a developer, I want a markdown export function so that conversation trees can be serialized to readable markdown format.

**Acceptance Criteria:**
- [ ] `exportToMarkdown(tree, options)` function in `src/export/markdown.ts` accepts a `DialogueTree` and options: `{mode: 'active-branch' | 'full-tree' | 'from-node', fromNodeId?: string}`
- [ ] Output starts with header: `# Research Session: {tree.title}`, date, persona, model metadata
- [ ] Each message rendered as `**User:** {content}` or `**Assistant:** {content}` with `---` separator between message pairs
- [ ] LaTeX preserved as raw `$...$` and `$$...$$` delimiters (no transformation)
- [ ] RAG citations (from `metadata.sources`) rendered as blockquote: `> Sources: [title](url), ...`
- [ ] For `active-branch` mode: exports messages along `tree.activePath` from root to leaf
- [ ] For `full-tree` mode: exports all branches using `## Branch N: {first-message-preview}` headings. Warns if tree has more than 10 branches (returns warning string prepended to output)
- [ ] For `from-node` mode: exports from the specified node down to the leaf of the active branch
- [ ] Branch points annotated with `<!-- Branch: N siblings -->` HTML comments
- [ ] Unit tests cover: single-branch export, multi-branch export, from-node export, LaTeX preservation, citation formatting, empty tree
- [ ] Typecheck/lint passes

---

### US-042: Chat Export — HTML Builder

**Description:** As a developer, I want an HTML export function so that conversations can be rendered with KaTeX math as self-contained HTML files.

**Acceptance Criteria:**
- [ ] `exportToHtml(tree, options)` function in `src/export/html.ts` accepts same parameters as markdown export
- [ ] First generates markdown via `exportToMarkdown()`, then renders it via `markdown-it` + KaTeX (reusing the extension's existing rendering pipeline)
- [ ] Output is a complete HTML document with `<!DOCTYPE html>`, charset, viewport meta
- [ ] KaTeX CSS linked via CDN (`https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css`)
- [ ] Includes inline CSS for styling: VS Code-inspired colors, proper fonts, max-width 800px centered content, print-friendly margins via `@media print`
- [ ] HTML is self-contained except for the CDN CSS link (no local file references)
- [ ] Unit tests cover: HTML structure valid (contains DOCTYPE, html, head, body), KaTeX CDN link present, content rendered
- [ ] Typecheck/lint passes

---

### US-043: Chat Export — Export Handler and Protocol

**Description:** As a developer, I want a webview message handler for export actions so that the UI can trigger exports.

**Acceptance Criteria:**
- [ ] `WebviewToHost` union in `protocol.ts` adds: `{type: 'exportMarkdown', mode: 'active-branch'|'full-tree'|'from-node', fromNodeId?: string}` and `{type: 'exportHtml', mode: 'active-branch'|'full-tree'|'from-node', fromNodeId?: string}`
- [ ] `webview-ui/src/types.ts` mirrors the new message types
- [ ] `src/webview/handlers/export-handler.ts` registers handlers for both message types
- [ ] `exportMarkdown` handler: gets current tree from panel, calls `exportToMarkdown()`, opens `showSaveDialog` with filter `{Markdown: ['md']}` and suggested filename `{tree-title}-{date}.md`, writes file via `vscode.workspace.fs.writeFile`
- [ ] `exportHtml` handler: same flow but calls `exportToHtml()`, filter `{HTML: ['html']}`, filename `.html`
- [ ] If no tree is active, shows warning: "No active research session to export."
- [ ] For `full-tree` mode with more than 10 branches, shows confirmation: "This tree has N branches. Export all?"
- [ ] Export handler registered in `panel.ts` constructor
- [ ] Typecheck/lint passes

---

### US-044: Chat Export — UI (Export Button and Context Menu)

**Description:** As a user, I want an Export button in the Research tab header and export options in the message context menu so that I can save my research conversations.

**Acceptance Criteria:**
- [ ] Research tab header shows an "Export" button (positioned after the RAG toggle)
- [ ] Clicking Export shows a dropdown/QuickPick with 4 options: "Active branch as Markdown", "Full tree as Markdown", "Active branch as HTML", "Full tree as HTML"
- [ ] Each option sends the corresponding `exportMarkdown` or `exportHtml` message to the extension host
- [ ] Right-click context menu on any message (in MessageBubble) adds two items: "Export from here (Markdown)" and "Export from here (HTML)"
- [ ] Context menu export sends `{type: 'exportMarkdown', mode: 'from-node', fromNodeId: nodeId}` (or exportHtml)
- [ ] Export button and context menu items are disabled during streaming (when `isStreaming` is true)
- [ ] Verify in browser (webview): Export button visible, dropdown works, context menu items appear, save dialog opens
- [ ] Typecheck/lint passes

## 4. Functional Requirements

FR-1: The extension shall support `azure-openai` as a provider option alongside `vscode-lm`, `openai`, `anthropic`, and `google`.

FR-2: Azure OpenAI API key shall be stored in VS Code SecretStorage under the key `azure-openai-api-key`.

FR-3: Azure OpenAI settings (`azureEndpoint`, `azureDeployment`, `azureAuthMethod`, `azureApiVersion`) shall be stored in VS Code configuration under `mathAgent.llm.*`.

FR-4: When `azureAuthMethod` is `managed-identity`, the extension shall first try `DefaultAzureCredential`, then fall back to `InteractiveBrowserCredential` (browser OAuth login).

FR-5: `@azure/identity` shall be lazy-imported via dynamic `import()` to avoid loading browser/native dependencies at extension startup.

FR-6: The onboarding wizard shall auto-fetch the list of Azure deployments from `GET {endpoint}/openai/deployments` and present them as a QuickPick. If the API call fails, it shall fall back to manual text input.

FR-7: After the user selects a deployment from the auto-discovery list, the wizard shall validate the deployment by sending a minimal test request. If validation fails, it shall show an error and allow re-selection.

FR-8: The markdown export shall preserve raw LaTeX delimiters (`$...$` and `$$...$$`) without transformation.

FR-9: The HTML export shall link KaTeX CSS from CDN (`https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css`) and include inline styling for print-friendly PDF output.

FR-10: For full-tree export, if the tree has more than 10 branches, the extension shall show a confirmation dialog before proceeding.

FR-11: Export files shall be saved via `vscode.window.showSaveDialog` with appropriate file type filters and suggested filenames.

FR-12: All export actions shall be disabled during active streaming.

## 5. Non-Goals (Out of Scope)

- **No Azure Government / sovereign cloud support** — only public Azure (`*.openai.azure.com`) endpoints are supported in v1
- **No real-time collaboration on exports** — no shared links, no cloud upload, no Google Docs integration
- **No Azure AD conditional access / MFA prompts** — `DefaultAzureCredential` and `InteractiveBrowserCredential` handle standard flows; complex conditional access policies are not supported
- **No direct PDF file generation** — users print HTML to PDF in their browser
- **No export to LaTeX source** — markdown preserves raw LaTeX for VS Code preview; separate `.tex` export is handled by the Write tab
- **No batch export** — users export one tree at a time

## 6. Design Considerations

### Azure OpenAI UI

- Azure OpenAI appears as "Azure OpenAI / {deployment}" in the model selector dropdown
- When Azure settings are incomplete (no endpoint or deployment), the provider does not appear in the model selector
- The onboarding wizard uses the same multi-step QuickPick pattern as existing providers

### Export UI

- Export button uses a document/download icon, positioned in the Research tab header after the RAG toggle
- The dropdown is implemented as a VS Code QuickPick (not a custom webview dropdown) — triggered via `postMessage` to extension host which shows `vscode.window.showQuickPick`
- Context menu export items appear below "Delete branch" in the message right-click menu

### Styling

- HTML export uses VS Code-inspired dark theme by default with `@media (prefers-color-scheme: light)` for light mode
- Print styles use white background, black text, proper margins regardless of theme

## 7. Technical Considerations

### Dependencies

- `@azure/identity` — lazy imported via `await import('@azure/identity')`. Marked as `external` in `esbuild.extension.js` (same as `pdf-parse`). Users who need managed identity auth must have this package available.
- No new dependencies for export — reuses existing `markdown-it` and `katex` already bundled in the extension.

### Bundle Size

- `@azure/identity` is ~2MB but only loaded when managed identity is selected. API key auth does not trigger the import.
- Export adds no bundle size since it reuses existing rendering code.

### Contracts (Cross-Story Consistency)

- Secret key name: `azure-openai-api-key` (used in both provider and onboarding)
- Settings prefix: `mathAgent.llm.azure*` (endpoint, deployment, authMethod, apiVersion)
- Provider ID: `azure-openai` (used in provider, services, model selector, onboarding)

### esbuild Configuration

- Add `@azure/identity` to the `external` array in `esbuild.extension.js`

## 8. Success Metrics

- Azure OpenAI provider successfully sends and receives streaming responses with both API key and managed identity auth
- Deployment auto-discovery returns the correct list of deployments for a given endpoint
- Markdown export produces valid markdown where LaTeX renders correctly in VS Code's markdown preview
- HTML export produces a self-contained HTML file where KaTeX math renders correctly in Chrome/Firefox/Edge
- HTML export prints to PDF with correct formatting via browser print dialog
- All new unit tests pass with 80%+ coverage on export and provider code

## 9. Open Questions

- Should the deployment auto-discovery cache the list for a period of time, or always fetch fresh?
- Should the HTML export support a light/dark theme toggle, or always use dark with print override?
- For managed identity, should we surface which credential source was used (e.g., "Authenticated via Azure CLI") in the output channel?

## Lifecycle Checklist

- **First-run behavior:** Azure OpenAI appears in onboarding wizard. Export button shows immediately but exports are empty if no messages exist (shows "No active research session to export" warning).
- **Returning-user behavior:** Azure settings persist in VS Code config. Provider auto-restores from `mathAgent.llm.provider: azure-openai` on startup. Export works on any saved tree.
- **Update behavior:** N/A — new feature, no migration needed. Existing trees gain export capability automatically.
- **Error recovery:** Azure auth failures show clear error messages with actionable suggestions. Export file save failures show VS Code error notification. Network failures during deployment discovery fall back to manual input.
- **No-data/empty state:** Export with no active tree shows warning. Azure model selector hidden when endpoint/deployment not configured.
- **Uninstall/disable:** Azure settings remain in VS Code config (harmless). No cleanup needed. Export produces standalone files with no extension dependency.
