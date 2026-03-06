# PRD: Math Research Agent (VS Code Extension)

## 1. Introduction/Overview

Math Research Agent is a VS Code extension that unifies the mathematical research workflow — from idea exploration to proof development to paper writing — in a single tool. It provides a branching dialogue interface for non-linear research exploration, RAG-style knowledge retrieval from arXiv/nLab/Wikipedia, multiple math persona modes with multi-agent orchestration, optional Lean4 formal verification, and an AI writing assistant that injects research results directly into LaTeX files. It supports four LLM providers: VS Code LM API, OpenAI (GPT-5.4), Anthropic (Claude Opus 4.6), and Google (Gemini 3.1 Pro).

## 2. Goals

- Provide a branching dialogue interface where mathematicians can explore ideas non-linearly, forking from any message to develop alternative approaches
- Auto-retrieve relevant definitions, theorems, and references from arXiv, nLab, and Wikipedia when math entities are detected in conversation
- Support multiple math personas (algebraist, analyst, geometer, etc.) that shape proof strategies, with a multi-agent mode that synthesizes perspectives via an orchestration agent
- Enable progressive formalization — informal proof sketches by default, optional Lean4 verification per step
- Inject AI-drafted paragraphs and sections directly into the user's `.tex` files based on research dialogue context
- Support four LLM providers with secure API key storage and mid-session model switching

## 3. User Stories

### US-001: Extension Scaffold and Activation

**Description:** As a developer, I want the VS Code extension project scaffolded with proper structure so that all subsequent features have a foundation to build on.

**Acceptance Criteria:**
- [ ] Extension activates without errors when installed in VS Code
- [ ] `package.json` declares extension metadata, activation events, and contribution points
- [ ] `src/extension.ts` contains `activate()` and `deactivate()` functions
- [ ] Project builds with `npm run compile` without errors
- [ ] Extension contributes a command `mathAgent.openPanel` visible in command palette
- [ ] Typecheck/lint passes

---

### US-002: LLM Service — Multi-Provider Abstraction

**Description:** As a user, I want to connect my preferred LLM provider so that I can use GPT-5.4, Claude Opus 4.6, Gemini 3.1 Pro, or VS Code Copilot models.

**Acceptance Criteria:**
- [ ] `LlmService` exposes a unified `sendMessage(messages, options): AsyncIterable<string>` interface
- [ ] Supports four providers: `vscode-lm`, `openai`, `anthropic`, `google`
- [ ] Provider selection configured via `mathAgent.llm.provider` setting
- [ ] Model name configured per provider via `mathAgent.llm.openaiModel`, `mathAgent.llm.anthropicModel`, `mathAgent.llm.googleModel` settings
- [ ] API keys stored in VS Code `SecretStorage`, never in plaintext settings
- [ ] When API key is missing or invalid, throws a typed `LlmAuthError` with provider name
- [ ] When provider API returns a rate limit error, throws a typed `LlmRateLimitError`
- [ ] Streaming responses yield string chunks as they arrive
- [ ] Unit tests cover: provider switching, auth error handling, rate limit error handling
- [ ] Typecheck/lint passes

---

### US-003: LLM Service — VS Code Language Model API Provider

**Description:** As a Copilot subscriber, I want to use VS Code's built-in Language Model API so that I don't need a separate API key.

**Acceptance Criteria:**
- [ ] `VscodeLmProvider` implements the provider interface from US-002
- [ ] Calls `vscode.lm.selectChatModels()` to obtain available models
- [ ] Handles user consent dialog (authentication prompt)
- [ ] Streams responses using `model.sendRequest()` and iterates `response.text`
- [ ] When no models are available, throws `LlmAuthError` with message "No Copilot models available"
- [ ] Unit tests cover: model selection, consent handling, streaming
- [ ] Typecheck/lint passes

---

### US-004: LLM Service — OpenAI Provider

**Description:** As a user with an OpenAI API key, I want to use GPT-5.4 for mathematical reasoning.

**Acceptance Criteria:**
- [ ] `OpenAiProvider` implements the provider interface from US-002
- [ ] Uses `openai` npm package to create streaming chat completions
- [ ] Reads API key from `SecretStorage` with key `mathAgent.openaiApiKey`
- [ ] Default model is `gpt-5.4`, configurable via `mathAgent.llm.openaiModel`
- [ ] Streaming yields chunks from the response delta content
- [ ] Maps OpenAI-specific errors to `LlmAuthError` and `LlmRateLimitError`
- [ ] Unit tests with mocked OpenAI client cover: streaming, auth error, rate limit
- [ ] Typecheck/lint passes

---

### US-005: LLM Service — Anthropic Provider

**Description:** As a user with an Anthropic API key, I want to use Claude Opus 4.6 for mathematical reasoning.

**Acceptance Criteria:**
- [ ] `AnthropicProvider` implements the provider interface from US-002
- [ ] Uses `@anthropic-ai/sdk` npm package to create streaming messages
- [ ] Reads API key from `SecretStorage` with key `mathAgent.anthropicApiKey`
- [ ] Default model is `claude-opus-4-6`, configurable via `mathAgent.llm.anthropicModel`
- [ ] Streaming yields chunks from message stream events
- [ ] Maps Anthropic-specific errors to `LlmAuthError` and `LlmRateLimitError`
- [ ] Unit tests with mocked Anthropic client cover: streaming, auth error, rate limit
- [ ] Typecheck/lint passes

---

### US-006: LLM Service — Google AI Provider

**Description:** As a user with a Google AI API key, I want to use Gemini 3.1 Pro for mathematical reasoning.

**Acceptance Criteria:**
- [ ] `GoogleProvider` implements the provider interface from US-002
- [ ] Uses `@google/generative-ai` npm package to create streaming content
- [ ] Reads API key from `SecretStorage` with key `mathAgent.googleApiKey`
- [ ] Default model is `gemini-3.1-pro`, configurable via `mathAgent.llm.googleModel`
- [ ] Streaming yields chunks from the generateContentStream response
- [ ] Maps Google-specific errors to `LlmAuthError` and `LlmRateLimitError`
- [ ] Unit tests with mocked Google client cover: streaming, auth error, rate limit
- [ ] Typecheck/lint passes

---

### US-007: First-Run Onboarding Wizard

**Description:** As a new user, I want a guided setup wizard so that I can configure my LLM provider without reading documentation.

**Acceptance Criteria:**
- [ ] On first activation (no provider configured and no API keys stored), a multi-step QuickPick wizard launches
- [ ] Step 1: "Choose your LLM provider" — shows four options: VS Code Copilot, OpenAI, Anthropic, Google
- [ ] Step 2 (if not VS Code Copilot): "Enter your API key" — secure input box with password masking
- [ ] Step 3: "Test connection" — sends a simple test prompt, shows success or failure message
- [ ] On success: stores API key in `SecretStorage`, sets `mathAgent.llm.provider` in settings, shows "Ready!" notification
- [ ] On failure: shows error message with "Try again" and "Skip" options
- [ ] Wizard does not re-launch once a provider is configured
- [ ] Typecheck/lint passes

---

### US-008: Dialogue Tree Data Model and Tree Manager

**Description:** As a developer, I want a tree data structure and manager so that branching conversations can be created, navigated, and persisted.

**Acceptance Criteria:**
- [ ] `DialogueNode` interface: `id`, `parentId`, `role` ('user'|'assistant'), `content`, `children` (string[]), `metadata` ({ timestamp, model, persona?, sources?, lean4Result? })
- [ ] `DialogueTree` interface: `id`, `title`, `rootId`, `activePath` (string[]), `nodes` (Record<string, DialogueNode>), `createdAt`, `updatedAt`
- [ ] `TreeManager` class with methods: `createTree(title)`, `addNode(treeId, parentId, role, content, metadata)`, `forkFrom(treeId, nodeId)` (sets activePath to the fork point), `switchBranch(treeId, nodeId)` (updates activePath to follow this node's lineage), `deleteBranch(treeId, nodeId)` (deletes node and all descendants), `getActivePath(treeId)` (returns ordered nodes from root to active leaf)
- [ ] `forkFrom` creates a new user node as a child of the specified node and updates `activePath`
- [ ] `deleteBranch` removes the target node and all its descendants from `nodes`, and removes the target from its parent's `children` array
- [ ] `getActivePath` returns an array of `DialogueNode` objects in order from root to the deepest node along `activePath`
- [ ] Unit tests cover: create tree, add nodes, fork, switch branch, delete branch with children, get active path
- [ ] Typecheck/lint passes

---

### US-009: Storage Service — Tree Persistence

**Description:** As a user, I want my dialogue trees saved to disk so that I can resume research sessions across VS Code restarts.

**Acceptance Criteria:**
- [ ] `StorageService` saves dialogue trees as JSON to `.math-agent/trees/{treeId}.json` in the workspace root
- [ ] Auto-creates `.math-agent/trees/` directory if it doesn't exist
- [ ] On every save, creates a `.backup` copy of the previous version at `.math-agent/trees/{treeId}.backup.json`
- [ ] `loadTree(treeId)` reads and parses the JSON file, returning a `DialogueTree`
- [ ] `listTrees()` returns metadata (id, title, updatedAt) for all trees in the directory
- [ ] When JSON parsing fails, throws a typed `CorruptTreeError` with the tree ID
- [ ] `.math-agent/` is added to `.gitignore` if a `.gitignore` exists in the workspace
- [ ] Unit tests cover: save/load round-trip, backup creation, corrupt file detection, list trees
- [ ] Typecheck/lint passes

---

### US-010: Context Builder

**Description:** As a developer, I want a service that assembles LLM context from the active branch path, attached papers, and RAG results, so that each branch gets coherent context.

**Acceptance Criteria:**
- [ ] `ContextBuilder.build(tree, nodeId, options)` returns an array of LLM messages in order: system prompt, attached papers context, path messages (root to nodeId), RAG context, user message
- [ ] System prompt is determined by the active persona configuration
- [ ] Path messages are extracted by walking from root to the specified node along parent links
- [ ] Attached papers are injected as a system message with paper title and extracted text
- [ ] RAG results (if any) are injected as a system message with source attribution
- [ ] No messages from sibling branches are included (no cross-contamination)
- [ ] Unit tests cover: basic path assembly, persona system prompt injection, attached paper inclusion, RAG inclusion, sibling exclusion
- [ ] Typecheck/lint passes

---

### US-011: Context Trimming and Memory Persistence

**Description:** As a user with deep research sessions, I want the system to handle context window limits gracefully while preserving a memory file of trimmed content.

**Acceptance Criteria:**
- [ ] `ContextBuilder` accepts a `maxTokens` parameter (estimated via character count / 4 approximation)
- [ ] When assembled context exceeds `maxTokens`, trimming order is: (1) RAG results removed first, (2) older path messages summarized, (3) attached papers preserved last
- [ ] When trimming occurs, a memory file is written to `.math-agent/trees/{treeId}/memory/context-trim-{timestamp}.md`
- [ ] Memory file Part 1: structured summary with headings "Main Idea", "Current Tasks", "Key Results"
- [ ] Memory file Part 2: full transcript of the trimmed messages under heading "Full Transcript"
- [ ] The summary in Part 1 is generated by sending the trimmed messages to the LLM with a summarization prompt
- [ ] Unit tests cover: trimming order, memory file creation, memory file format
- [ ] Typecheck/lint passes

---

### US-012: Math Persona Manager

**Description:** As a mathematician, I want to select a math persona (algebraist, analyst, geometer, etc.) so that the LLM adopts domain-appropriate proof strategies and vocabulary.

**Acceptance Criteria:**
- [ ] `PersonaManager` provides built-in persona configs for: algebraist, analyst, geometer, topologist, number-theorist, logician
- [ ] Each persona config contains: `id`, `label`, `systemPrompt` (minimum 100 characters of domain-specific instructions), `preferredSources` (subset of arxiv/nlab/wikipedia)
- [ ] `getPersona(id)` returns the `PersonaConfig` for the given ID
- [ ] `listPersonas()` returns all available personas
- [ ] Default persona is configurable via `mathAgent.defaultPersona` setting
- [ ] Custom personas can be defined in `mathAgent.customPersonas` setting as JSON array of `PersonaConfig` objects
- [ ] Unit tests cover: get built-in persona, list all personas, custom persona loading, default persona setting
- [ ] Typecheck/lint passes

---

### US-013: Knowledge Service — arXiv Client

**Description:** As a researcher, I want to search arXiv for papers so that I can find relevant literature during exploration.

**Acceptance Criteria:**
- [ ] `ArxivClient.search(query, maxResults)` sends HTTP GET to `https://export.arxiv.org/api/query` with `search_query` and `max_results` params
- [ ] Parses Atom XML response into an array of `Citation` objects with: `source: 'arxiv'`, `title`, `url` (abs link), `snippet` (abstract, truncated to 500 chars), `bibtex` (auto-generated from metadata), `fetchedAt`
- [ ] BibTeX generation includes: `@article{arxivId, title, author, year, journal={arXiv preprint}, eprint={arxivId}}`
- [ ] Respects rate limiting: maximum 1 request per 3 seconds (queued)
- [ ] Results are cached in `KnowledgeCache` with 24-hour TTL
- [ ] When arXiv API returns non-200 status, returns empty array and logs warning (does not throw)
- [ ] Unit tests with fixture XML responses cover: parsing, BibTeX generation, caching, error handling
- [ ] Typecheck/lint passes

---

### US-014: Knowledge Service — Wikipedia Client

**Description:** As a researcher, I want to look up mathematical definitions and concepts on Wikipedia so that I get accessible explanations.

**Acceptance Criteria:**
- [ ] `WikipediaClient.search(query, maxResults)` sends HTTP GET to `https://en.wikipedia.org/w/api.php` with `action=query`, `list=search`, `srsearch`, `format=json`
- [ ] `WikipediaClient.getPageContent(title)` fetches page extract via `action=query`, `prop=extracts`, `exintro=true`
- [ ] Returns array of `Citation` objects with: `source: 'wikipedia'`, `title`, `url` (wiki page link), `snippet` (extract, truncated to 500 chars), `fetchedAt`
- [ ] Results are cached in `KnowledgeCache` with 24-hour TTL
- [ ] When Wikipedia API returns non-200 status, returns empty array and logs warning
- [ ] Unit tests with fixture JSON responses cover: search, page content, caching, error handling
- [ ] Typecheck/lint passes

---

### US-015: Knowledge Service — nLab Scraper

**Description:** As a researcher, I want to look up definitions on nLab so that I get precise, research-level mathematical content.

**Acceptance Criteria:**
- [ ] `NlabClient.getPage(pageName)` sends HTTP GET to `https://ncatlab.org/nlab/show/{pageName}`
- [ ] Parses HTML response, extracts main content section text (strips navigation, sidebar, footer)
- [ ] Returns a `Citation` object with: `source: 'nlab'`, `title` (page name), `url`, `snippet` (first 500 chars of extracted text), `fetchedAt`
- [ ] `NlabClient.search(query)` attempts to fetch the page directly (nLab has no search API); if 404, returns empty array
- [ ] Respects rate limiting: maximum 1 request per 5 seconds
- [ ] Results are cached in `KnowledgeCache` with 24-hour TTL
- [ ] When page returns 404 or non-200, returns empty array and logs warning
- [ ] Unit tests with fixture HTML responses cover: page parsing, content extraction, caching, 404 handling
- [ ] Typecheck/lint passes

---

### US-016: Knowledge Service — RAG Orchestrator and Entity Detection

**Description:** As a user, I want math entities in my messages to be auto-detected and looked up across all sources so that my conversations are grounded in accurate knowledge.

**Acceptance Criteria:**
- [ ] `EntityDetector` uses a two-pass approach: (1) keyword matching against a bundled dictionary of ~2000 common math terms, (2) for unmatched messages, sends to a fast/cheap LLM (configurable via `mathAgent.llm.entityDetectionModel`, default to cheapest available model) asking "List the mathematical entities in this text"
- [ ] `RagOrchestrator.enrich(message, options)` calls `EntityDetector`, then queries arXiv, Wikipedia, and nLab in parallel for each detected entity
- [ ] Returns aggregated `Citation[]` results, deduplicated by URL
- [ ] RAG is togglable via `mathAgent.rag.enabled` setting (default: true)
- [ ] When a source fails, the orchestrator continues with remaining sources (no all-or-nothing failure)
- [ ] UI receives a `ragStatus` object: `{ enabled: boolean, sources: { arxiv: 'success'|'failed'|'skipped', wikipedia: ..., nlab: ... }, citations: Citation[] }`
- [ ] Unit tests cover: entity detection (keyword hit, LLM fallback), parallel fetch, deduplication, partial failure, toggle off
- [ ] Typecheck/lint passes

---

### US-017: Knowledge Cache

**Description:** As a developer, I want a caching layer for knowledge queries so that repeated lookups are fast and respectful of rate limits.

**Acceptance Criteria:**
- [ ] `KnowledgeCache` stores query results keyed by `{source}:{query}` in VS Code `globalState` (Memento API)
- [ ] `get(source, query)` returns cached `Citation[]` if entry exists and is within TTL (default 24 hours)
- [ ] `set(source, query, citations)` stores citations with current timestamp
- [ ] `isExpired(entry)` returns true if `Date.now() - entry.fetchedAt > ttl`
- [ ] `clear()` removes all cached entries
- [ ] TTL is configurable via `mathAgent.rag.cacheTtlHours` setting
- [ ] Unit tests cover: set/get, TTL expiry, cache miss, clear
- [ ] Typecheck/lint passes

---

### US-018: Chat Participant — @math Registration and Basic Chat

**Description:** As a Copilot user, I want to type `@math` in Copilot Chat to ask quick math questions.

**Acceptance Criteria:**
- [ ] Extension registers a chat participant with id `math-research-agent.math`, name `math`, fullName `Math Research Agent`, isSticky `true`
- [ ] Chat participant declared in `package.json` under `contributes.chatParticipants`
- [ ] Request handler receives user prompt, calls `LlmService` with the active persona's system prompt, streams response back via `stream.markdown()`
- [ ] Responses include LaTeX (passed through as-is in markdown — Copilot Chat renders `$...$` and `$$...$$`)
- [ ] When no LLM is configured, response includes a button "Configure LLM" that triggers the onboarding wizard
- [ ] Typecheck/lint passes

---

### US-019: Chat Participant — Slash Commands

**Description:** As a user, I want slash commands in `@math` chat for explicit actions like searching sources or opening the Research Panel.

**Acceptance Criteria:**
- [ ] Chat participant registers three commands in `package.json`: `/search`, `/arxiv`, `/studio`
- [ ] `/search [query]` — triggers RAG orchestrator with the query, returns formatted citation results (title, source, snippet, URL)
- [ ] `/arxiv [query]` — triggers arXiv client only, returns formatted paper results with BibTeX
- [ ] `/studio` — executes `mathAgent.openPanel` command to open the Research Panel, responds with "Opening Math Research Studio..."
- [ ] Commands are detected via `request.command` in the handler
- [ ] Unknown commands fall through to normal chat behavior
- [ ] Typecheck/lint passes

---

### US-020: Webview Panel — Shell and Tab Navigation

**Description:** As a user, I want to open the Math Research Panel with Research and Write tabs so that I have a workspace for deep exploration.

**Acceptance Criteria:**
- [ ] Command `mathAgent.openPanel` creates or reveals a `WebviewPanel` with `viewType: 'mathAgent.researchPanel'`
- [ ] Webview loads a React application bundled with webpack/esbuild
- [ ] React app renders a tab bar with two tabs: "Research" and "Write"
- [ ] Clicking a tab switches the visible content area (no page reload)
- [ ] Panel retains state when hidden and re-shown (`retainContextWhenHidden: true`)
- [ ] Panel title is "Math Research Studio"
- [ ] Webview CSP allows loading bundled scripts, styles, and KaTeX fonts from the extension
- [ ] Verify in browser (webview): tab switching works, no console errors
- [ ] Typecheck/lint passes

---

### US-021: Webview — Research Tab Message Display with KaTeX

**Description:** As a user, I want to see chat messages in the Research tab with LaTeX rendered correctly.

**Acceptance Criteria:**
- [ ] Research tab displays a scrollable list of message bubbles (user messages right-aligned, assistant left-aligned)
- [ ] Each message's content is rendered via `markdown-it` with `markdown-it-katex` plugin
- [ ] Inline LaTeX (`$...$`) renders as inline math
- [ ] Display LaTeX (`$$...$$`) renders as centered block math
- [ ] Malformed LaTeX renders as raw text (graceful fallback, no crash)
- [ ] KaTeX CSS and fonts are bundled with the extension and loaded in the webview
- [ ] A text input area at the bottom allows typing and submitting messages (Enter key or Send button)
- [ ] Verify in browser (webview): LaTeX renders correctly for `$\int_0^1 f(x)dx$` and `$$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$`
- [ ] Typecheck/lint passes

---

### US-022: Webview — Research Tab Message Streaming

**Description:** As a user, I want to see LLM responses stream in real-time so that I don't wait for the full response.

**Acceptance Criteria:**
- [ ] When user submits a message, extension host receives it via `postMessage({ type: 'send', content, nodeId })`
- [ ] Extension host creates a user node in the tree, sends prompt to LLM via `ContextBuilder` + `LlmService`
- [ ] As LLM streams chunks, extension host sends `postMessage({ type: 'streamChunk', nodeId, text })` to webview
- [ ] Webview appends chunks to the active assistant message bubble, re-rendering KaTeX on each update (debounced to every 100ms)
- [ ] When stream completes, extension host sends `postMessage({ type: 'streamEnd', nodeId })`
- [ ] A "Stop" button appears during streaming, sending `postMessage({ type: 'stopStream' })` which cancels the LLM request
- [ ] Partial responses from cancelled streams are preserved in the node with an "Incomplete" indicator
- [ ] Verify in browser (webview): text appears progressively, LaTeX renders during streaming
- [ ] Typecheck/lint passes

---

### US-023: Webview — Branching: Fork from Any Message

**Description:** As a researcher, I want to fork a new branch from any message so that I can explore alternative ideas.

**Acceptance Criteria:**
- [ ] Hovering over any message bubble reveals a "Branch" icon button
- [ ] Clicking "Branch" calls `postMessage({ type: 'fork', nodeId })` to extension host
- [ ] Extension host calls `TreeManager.forkFrom(treeId, nodeId)`, updates `activePath`
- [ ] Webview receives updated tree state, renders the new branch as the active conversation (input box appears below the fork point)
- [ ] The previous continuation from that fork point appears as a dimmed/collapsed card showing: first line of content + child branch count
- [ ] Fork point message itself remains fully visible and undimmed
- [ ] Verify in browser (webview): fork creates new input area, old branch dims
- [ ] Typecheck/lint passes

---

### US-024: Webview — Branching: Switch Branch and Breadcrumb

**Description:** As a researcher, I want to switch between branches and see my current position in the tree.

**Acceptance Criteria:**
- [ ] A breadcrumb bar at the top of the Research tab shows the current path: labels derived from first 30 chars of each node's content, separated by `>`
- [ ] Clicking any breadcrumb segment navigates to that node (calls `TreeManager.switchBranch`)
- [ ] Clicking a dimmed sibling branch card switches to that branch (full content loads, previously active branch dims)
- [ ] When a node has more than 5 sibling branches, siblings beyond 5 are collapsed into a "+N more" expander
- [ ] Branch switching preserves scroll position of the target branch (if previously visited)
- [ ] Verify in browser (webview): breadcrumb reflects active path, clicking switches branches
- [ ] Typecheck/lint passes

---

### US-025: Webview — Branching: Delete Branch

**Description:** As a user, I want to delete a branch I no longer need.

**Acceptance Criteria:**
- [ ] Right-clicking a message or branch card shows a context menu with "Delete branch"
- [ ] If the node has children, a confirmation dialog shows: "This branch has N sub-branches. Delete all?"
- [ ] On confirm, `postMessage({ type: 'deleteBranch', nodeId })` is sent to extension host
- [ ] Extension host calls `TreeManager.deleteBranch(treeId, nodeId)`, which removes the node and all descendants
- [ ] If the deleted branch was the active path, `activePath` switches to the nearest sibling or parent
- [ ] Tree is auto-saved after deletion
- [ ] Verify in browser (webview): branch and children disappear, active path updates
- [ ] Typecheck/lint passes

---

### US-026: Webview — Persona Selector

**Description:** As a mathematician, I want to select a math persona from the Research tab header so that the LLM adapts its proof style.

**Acceptance Criteria:**
- [ ] A dropdown in the Research tab header lists all available personas from `PersonaManager.listPersonas()`
- [ ] Selecting a persona sends `postMessage({ type: 'setPersona', personaId })` to extension host
- [ ] Subsequent LLM calls use the selected persona's system prompt via `ContextBuilder`
- [ ] The currently selected persona is displayed in the dropdown
- [ ] A "Multi-agent" option appears at the bottom of the dropdown list
- [ ] Selected persona is stored per-tree (different trees can have different active personas)
- [ ] Verify in browser (webview): dropdown shows personas, selection persists across messages
- [ ] Typecheck/lint passes

---

### US-027: Multi-Agent Mode with Orchestration

**Description:** As a researcher, I want multi-agent mode to send my question to multiple personas in parallel and get a synthesized answer, so that I benefit from cross-domain perspectives.

**Acceptance Criteria:**
- [ ] When persona is set to "multi-agent", user prompt is sent to 3 personas in parallel (default: algebraist, analyst, geometer — configurable via `mathAgent.multiAgent.personas` setting)
- [ ] Each persona call uses its own system prompt and runs as an independent LLM request
- [ ] All 3 responses are displayed in the webview as labeled side-by-side cards: "Algebraist:", "Analyst:", "Geometer:"
- [ ] After individual responses complete, an orchestration call sends all 3 responses to the LLM with prompt: "Synthesize these perspectives into a comprehensive answer"
- [ ] The synthesized response appears below the cards as the primary assistant message in the tree node
- [ ] Each card has a "Promote to branch" button that creates a new branch from that individual response
- [ ] Multi-agent responses render LaTeX correctly in all cards and the synthesis
- [ ] Verify in browser (webview): 3 cards appear, synthesis appears below, "Promote" creates branch
- [ ] Typecheck/lint passes

---

### US-028: Webview — RAG Indicator and Source Cards

**Description:** As a user, I want to see when RAG auto-retrieval fires and what sources were fetched so that I can trust and inspect the grounding.

**Acceptance Criteria:**
- [ ] When RAG enrichment runs for a message, a pill/badge appears below the message: "Sources: arXiv, Wikipedia, nLab" (listing only sources that returned results)
- [ ] Failed sources show as struck-through text in the pill (e.g., "~~nLab~~")
- [ ] Clicking the pill expands a list of citation cards: title, source icon, snippet (truncated to 100 chars), clickable URL
- [ ] Each citation card has a "Dismiss" button that removes it from the context for subsequent messages in this branch
- [ ] RAG toggle switch in the Research tab header enables/disables auto-retrieval (syncs with `mathAgent.rag.enabled` setting)
- [ ] Verify in browser (webview): pill appears after message, expands to show citations, dismiss works
- [ ] Typecheck/lint passes

---

### US-029: Attached Papers — Add and Manage

**Description:** As a researcher, I want to attach specific papers to my research session so that the LLM has that context when reasoning.

**Acceptance Criteria:**
- [ ] "Add paper" button in the Research tab header opens a QuickPick with options: "From file (PDF/TeX)" and "From arXiv ID"
- [ ] "From file" opens a file picker filtered to `.pdf` and `.tex` files; selected file text is extracted (for `.tex`: read raw file; for `.pdf`: use `pdf-parse` npm package)
- [ ] "From arXiv ID" shows an input box; on submit, fetches paper abstract and full text via arXiv API
- [ ] Attached papers appear in a collapsible sidebar section in the Research tab
- [ ] Each paper entry shows: title, source badge (arXiv/PDF/TeX), scope badge (Global/Branch)
- [ ] Clicking a paper shows its extracted text preview (first 200 chars)
- [ ] Right-click context menu on a paper: "Set scope: Global", "Set scope: This branch only", "Remove"
- [ ] Papers with scope "global" are injected into context for all branches; "branch" scope only for the specific branch
- [ ] Attached papers are persisted in the tree JSON under an `attachedPapers` field
- [ ] When PDF text extraction fails, show error "Could not extract text. Try a .tex file instead."
- [ ] Verify in browser (webview): papers appear in sidebar, scope toggle works, remove works
- [ ] Typecheck/lint passes

---

### US-030: Lean4 Service — Verification Integration

**Description:** As a researcher, I want to optionally verify proof steps in Lean4 so that I can check correctness formally.

**Acceptance Criteria:**
- [ ] `Lean4Service.isAvailable()` checks if `lean` binary is on PATH, returns boolean
- [ ] `Lean4Service.verify(leanCode)` writes code to a temp `.lean` file, runs `lean` CLI, captures stdout/stderr, returns `Lean4Result` object
- [ ] `Lean4Result` contains: `status` ('success'|'error'|'timeout'), `leanCode`, `diagnostics` (string[]), `verifiedAt`
- [ ] Timeout is 60 seconds by default, configurable via `mathAgent.lean4.timeoutMs`
- [ ] Lean4 toggle is controlled by `mathAgent.lean4.enabled` setting (default: false)
- [ ] When Lean4 is not installed, `isAvailable()` returns false; no errors thrown
- [ ] Unit tests cover: availability check, successful verification, error capture, timeout
- [ ] Typecheck/lint passes

---

### US-031: Lean4 — Proof Step Verification UI

**Description:** As a researcher, I want a "Verify in Lean4" button on proof steps so that I can check formal correctness inline.

**Acceptance Criteria:**
- [ ] When `mathAgent.lean4.enabled` is true AND `Lean4Service.isAvailable()` returns true, assistant messages show a "Verify in Lean4" button
- [ ] Clicking the button sends the message content to the LLM with prompt: "Translate this mathematical statement/proof into Lean4 code"
- [ ] The generated Lean4 code is passed to `Lean4Service.verify()`
- [ ] Result appears inline below the message: green badge "Verified" on success, red badge "Failed" with expandable diagnostics on error, yellow badge "Timeout" on timeout
- [ ] On failure, a "Fix and retry" button sends the Lean4 code + diagnostics back to the LLM for correction (up to 3 attempts)
- [ ] The `Lean4Result` is stored in the node's `metadata.lean4Result`
- [ ] When Lean4 is not enabled or not installed, the button does not appear (no tooltip-only mode for v1)
- [ ] Verify in browser (webview): button appears, badges show correctly, retry works
- [ ] Typecheck/lint passes

---

### US-032: Write Tab — AI Paper Writing Assistant

**Description:** As a researcher, I want the Write tab to help me draft paper sections from my research and inject them into my `.tex` files.

**Acceptance Criteria:**
- [ ] Write tab displays: a file selector (lists `.tex` files in workspace), a section view showing the current `.tex` file's structure (parsed `\section{}` and `\subsection{}` headings), and a chat input for AI writing commands
- [ ] "Draft from branch" action (available as right-click menu on branch cards in Research tab) sends the full branch context to the LLM with prompt: "Draft a LaTeX section based on this research discussion. Include proper theorem/proof environments and citations."
- [ ] LLM response is displayed in the Write tab as a LaTeX preview (rendered via KaTeX)
- [ ] "Insert into file" button lets user choose: which `.tex` file and after which section heading to inject the content
- [ ] Content is injected into the actual `.tex` file on disk using VS Code's `WorkspaceEdit` API (not a custom editor)
- [ ] AI chat in Write tab has document context — user can say "expand the proof in Section 3" and the LLM sees the full `.tex` file content
- [ ] Citations from the branch's sources are auto-formatted as `\cite{}` references; corresponding BibTeX entries are appended to the user's `.bib` file (if one exists) or displayed for manual copy
- [ ] Verify in browser (webview): file selector works, section structure displays, draft inserts into file
- [ ] Typecheck/lint passes

---

### US-033: Webview — Model Selector

**Description:** As a user, I want to switch LLM provider/model from the Research Panel without going to settings.

**Acceptance Criteria:**
- [ ] A model selector dropdown in the Research Panel header shows: current provider and model name (e.g., "OpenAI / gpt-5.4")
- [ ] Dropdown lists all configured providers (only those with valid API keys or VS Code LM available)
- [ ] Selecting a different provider/model sends `postMessage({ type: 'setModel', provider, model })` to extension host
- [ ] Extension host updates the active provider in `LlmService`; subsequent calls use the new provider
- [ ] The switch is session-scoped (does not change the persisted `mathAgent.llm.provider` setting)
- [ ] Each node's `metadata.model` records which model generated it
- [ ] Verify in browser (webview): dropdown shows configured providers, switching works for next message
- [ ] Typecheck/lint passes

---

### US-034: Tree List and Session Management

**Description:** As a user, I want to create, open, and manage multiple research sessions (trees).

**Acceptance Criteria:**
- [ ] Research tab header has a "Trees" dropdown listing all saved trees (from `StorageService.listTrees()`), sorted by `updatedAt` descending
- [ ] Selecting a tree loads it into the Research tab
- [ ] "New tree" option in the dropdown prompts for a title (input box), creates a new tree via `TreeManager.createTree()`, and activates it
- [ ] "Rename" context menu option on a tree allows changing the title
- [ ] "Delete" context menu option on a tree shows confirmation, then deletes the tree file from disk
- [ ] Current tree title is displayed in the panel header
- [ ] Verify in browser (webview): tree list shows all sessions, create/switch/rename/delete work
- [ ] Typecheck/lint passes

## 4. Functional Requirements

FR-1: The extension shall activate on the command `mathAgent.openPanel` and when the `@math` chat participant is invoked.

FR-2: The extension shall support four LLM providers: VS Code Language Model API, OpenAI, Anthropic, and Google AI, with a unified streaming interface.

FR-3: API keys shall be stored exclusively in VS Code's `SecretStorage` API, never in plaintext settings or files.

FR-4: The dialogue tree shall store nodes in a flat `Record<string, DialogueNode>` with parent-child references, supporting O(1) node lookup.

FR-5: The `activePath` array shall represent the ordered sequence of node IDs from root to the currently viewed leaf, updated on every fork or branch switch.

FR-6: Each dialogue node shall record in its metadata: timestamp, model used, persona (if any), citations (if any), and Lean4 result (if any).

FR-7: The RAG entity detection shall use a two-pass approach: keyword dictionary first, fast LLM fallback second.

FR-8: Knowledge source queries shall be cached in VS Code `globalState` with a configurable TTL (default 24 hours).

FR-9: When context window is exceeded, the system shall trim in order: RAG results first, then older path messages (summarized), then attached papers last.

FR-10: When context is trimmed, a memory file shall be persisted at `.math-agent/trees/{treeId}/memory/context-trim-{timestamp}.md` containing a structured summary and full transcript.

FR-11: Multi-agent mode shall send the user prompt to 3 persona-specific LLM calls in parallel, display individual responses as cards, and produce a synthesized response via an orchestration call.

FR-12: The Write tab shall inject LLM-drafted LaTeX content directly into `.tex` files on disk using VS Code's `WorkspaceEdit` API.

FR-13: The webview shall render LaTeX using `markdown-it` with `markdown-it-katex` plugin, supporting `$...$` (inline) and `$$...$$` (display) delimiters.

FR-14: KaTeX CSS, JavaScript, and font files shall be bundled with the extension and loaded in the webview respecting Content Security Policy.

FR-15: Lean4 verification shall be optional, controlled by `mathAgent.lean4.enabled` setting, and only show UI elements when both enabled and Lean4 is detected on PATH.

FR-16: All webview-to-extension-host communication shall use typed `postMessage` actions with a `type` discriminator field.

FR-17: The extension shall auto-create `.math-agent/` directory structure on first use and add it to `.gitignore` if one exists.

FR-18: First-run onboarding shall present a guided wizard when no LLM provider is configured.

FR-19: Attached papers shall support three sources: local PDF (text extracted via `pdf-parse`), local `.tex` (raw file read), and arXiv ID (fetched via API).

FR-20: Attached papers shall be scopeable as "global" (all branches) or "branch" (specific branch only).

## 5. Non-Goals (Out of Scope)

- **No real-time collaboration or multi-user editing** — this is a single-user tool for v1
- **No Overleaf or cloud LaTeX sync** — users manage their own `.tex` files locally
- **No formal bibliography management UI** — BibTeX is auto-generated from arXiv metadata and appended to `.bib` files; no manual entry or reference manager
- **No custom persona creation UI** — custom personas are defined in VS Code settings JSON (`mathAgent.customPersonas`)
- **No offline mode** — knowledge sources (arXiv, nLab, Wikipedia) require internet; LLM providers require internet (no local model support in v1)
- **No built-in LaTeX editor** — the Write tab is an AI writing assistant, not an editor; users use LaTeX Workshop or similar for editing
- **No mobile or web version** — VS Code desktop only
- **No conversation export to formats other than `.tex`** — no PDF export, no HTML export from the Research tab

## 6. Design Considerations

### Webview UI

- React with functional components and hooks for the webview app
- KaTeX for LaTeX rendering (not MathJax — faster, smaller bundle)
- Dimmed/collapsed branch cards use CSS opacity (0.4) and max-height collapse animation
- Breadcrumb uses VS Code-style `>` separator with truncated labels (30 char max)
- Multi-agent cards use a CSS grid layout (equal-width columns)
- Research tab has a fixed header (persona selector, model selector, RAG toggle, tree selector, add paper) and scrollable message area

### Color and Styling

- Follow VS Code theme variables (`--vscode-editor-background`, `--vscode-editor-foreground`, etc.) for native look
- Active branch: full opacity, standard theme colors
- Dimmed branches: 40% opacity, slightly reduced font size
- User messages: right-aligned with theme highlight background
- Assistant messages: left-aligned with theme editor background
- RAG pills: subtle border, small text, expandable with animation

### Accessibility

- All interactive elements are keyboard-navigable
- Screen reader labels on branch/fork buttons
- Sufficient color contrast ratios per WCAG 2.1 AA

## 7. Technical Considerations

### Dependencies

| Package | Purpose |
|---------|---------|
| `openai` | OpenAI API client |
| `@anthropic-ai/sdk` | Anthropic API client |
| `@google/generative-ai` | Google AI API client |
| `markdown-it` | Markdown parsing |
| `markdown-it-katex` | KaTeX plugin for markdown-it |
| `katex` | LaTeX rendering |
| `fast-xml-parser` | arXiv Atom XML parsing |
| `cheerio` | nLab HTML parsing |
| `pdf-parse` | PDF text extraction |
| `uuid` | Node ID generation |
| `react`, `react-dom` | Webview UI framework |

### Build System

- TypeScript for extension host code
- webpack or esbuild for bundling extension and webview separately
- Webview React app compiled separately, output loaded by the webview panel

### Performance

- LLM streaming debounced at 100ms for KaTeX re-rendering
- Knowledge source queries run in parallel (Promise.allSettled)
- Tree files lazy-loaded (only active tree in memory)
- KaTeX fonts preloaded to avoid FOUC in webview

### Security

- API keys in `SecretStorage` only
- Webview CSP restricts script sources to bundled files
- No `eval()` or inline scripts in webview
- User input sanitized before injection into LLM prompts (prevent prompt injection from attached papers)

## 8. Success Metrics

- Extension installs and activates without errors on VS Code 1.100+
- User can complete the full workflow: ask question -> branch -> explore -> draft paper section -> inject into `.tex` file
- LLM responses stream within 500ms of first chunk from provider
- RAG entity detection + knowledge fetch completes within 5 seconds
- Branch switching renders within 200ms
- KaTeX renders inline and display math without errors for standard mathematical notation
- All unit tests pass with 80%+ code coverage on core services (TreeManager, ContextBuilder, LlmService, Knowledge clients)
- Lean4 verification completes within 60 seconds or correctly reports timeout

## 9. Open Questions

- What specific math terms should be in the bundled entity detection dictionary? Start with terms from nLab's page index?
- Should the orchestration agent in multi-agent mode use the same model as the personas, or always use the "main" configured model?
- How should the context budget be split between attached papers and path messages when both are large? Fixed ratio or user-configurable?
- Should the memory files from context trimming be automatically re-ingested when the user asks about earlier topics, or only on explicit request?
- What is the best heuristic for auto-generating tree titles from the first user message?
