# Design: Math Research Agent (VS Code Extension)

**Date:** 2026-03-06
**Status:** Approved
**Approach:** Hybrid -- Chat Participant + Research Studio with Paper Writing

## Overview

### What We're Building

**Math Research Agent** -- a VS Code extension that serves as an AI-powered mathematical research companion. It combines three capabilities into a unified tool:

1. **Knowledge Retrieval** -- RAG-style auto-retrieval from arXiv, nLab, and Wikipedia whenever math entities (definitions, theorems, structures) are detected, plus explicit search commands. Togglable by the user.

2. **Research Exploration** -- A branching dialogue interface where mathematicians can develop ideas non-linearly. The active conversation branch is highlighted while sibling branches appear dimmed. Users can fork from any message to explore alternative proof strategies, conjectures, or approaches. Multiple math personas (algebraist, analyst, geometer, etc.) and multi-agent cross-domain reasoning are available.

3. **Paper Writing** -- A Prism-like LaTeX-native writing mode within the same panel, where explored ideas and proof sketches can be drafted into paper sections with full context awareness -- equations, citations, and document structure.

### Why

Mathematicians currently juggle separate tools: ChatGPT/Copilot for brainstorming, arXiv for literature, nLab for definitions, Overleaf/Prism for writing, and Lean4 for verification. This extension unifies the research workflow inside VS Code -- from initial idea exploration through branching dialogue, to knowledge-grounded proof development, to paper drafting -- all with LaTeX rendered correctly throughout.

### Entry Points

- **`@math` in Copilot Chat** -- quick queries, definitions, simple proofs (lightweight, native)
- **Math Research Panel** -- single webview with Research tab (branching tree) and Write tab (LaTeX editor), opened via command palette or `@math` escalation

### Default LLM

GPT-5.4 via VS Code Language Model API, configurable by user. Supports four providers:

| Method | Model | How |
|--------|-------|-----|
| VS Code LM API | Whatever Copilot provides (auto-select) | No config needed, requires Copilot subscription |
| OpenAI API key | GPT-5.4 (default) | User provides API key |
| Anthropic API key | Claude Opus 4.6 (suggested) | User provides API key |
| Google AI API key | Gemini 3.1 Pro | User provides API key |

## User Experience

### `@math` Chat Participant (Quick Mode)

Users type `@math` in Copilot Chat for lightweight interactions:
- `@math what is a derived category?` -- returns a definition with LaTeX, auto-fetches nLab/Wikipedia context if RAG toggle is on
- `@math search arxiv homological stability` -- explicit source search
- `@math open studio` -- launches the Research Panel

Responses stream with rendered LaTeX (inline `$...$` and display `$$...$$`). Citations appear as clickable references linking to source URLs.

### Research Tab (Branching Dialogue)

The primary exploration interface inside the Math Research Panel:

- **Linear chat with embedded tree structure** -- the active branch renders as a normal conversation. Sibling branches from fork points appear as dimmed/collapsed cards inline, showing a preview (first line + branch count). Click to switch branches.
- **Fork action** -- hover over any message to reveal a "Branch from here" button. Creates a new sibling branch with a fresh input box. The previous branch dims.
- **Branch indicator** -- a subtle breadcrumb at the top shows the current path: `Root > Q3 > Approach A > Step 2`. Clicking any node jumps to that fork point.
- **Math persona selector** -- a dropdown at the top: "Algebraist", "Analyst", "Geometer", "Topologist", "Custom...". Shapes the LLM's proof strategies and language. "Multi-agent" option sends the prompt to multiple personas and presents their perspectives side by side.
- **Progressive formalization** -- any proof sketch step has a "Verify in Lean4" button (if Lean4 toggle is enabled). Results appear inline as a success/failure badge with details expandable.
- **RAG indicator** -- when auto-retrieval fires, a subtle pill shows "Fetched: nLab, Wikipedia" with expandable source cards.
- **Attached papers** -- users can drag-and-drop PDFs, paste arXiv IDs, or use "Add paper" button to attach papers as persistent context. Attached papers appear as a collapsible sidebar list, toggleable per-branch or globally.

### Write Tab (Paper Workshop)

A LaTeX-aware writing environment within the same panel:

- **Draft from branch** -- right-click any branch in Research tab > "Draft as paper section". The LLM generates LaTeX using the full branch context (conversation, citations, proof sketches).
- **Split view** -- LaTeX source on left, live KaTeX preview on right.
- **Context-aware editing** -- the LLM sees the full document structure when assisting. Ask "rewrite the introduction to emphasize the categorical perspective" and it understands the surrounding sections.
- **Citation integration** -- references discovered during Research auto-populate a `\bibliography`. BibTeX entries generated from arXiv metadata.
- **Export** -- download as `.tex` file, copy to clipboard, or open in external editor.

### Workflow Example

1. Open `@math`, ask "What approaches exist for proving Serre spectral sequence convergence?"
2. Interesting -- open Studio. Fork into two branches: "filtration approach" and "exact couple approach"
3. Each branch develops independently with multi-step proof sketches
4. On the filtration branch, toggle Lean4 verification on a key lemma
5. Satisfied with the filtration approach -- "Draft as paper section"
6. Switch to Write tab, refine the LaTeX, add introduction, export `.tex`

## Data Model

### Dialogue Tree

```typescript
interface DialogueNode {
  id: string;                    // UUID
  parentId: string | null;       // null for root
  role: 'user' | 'assistant';
  content: string;               // Raw text with LaTeX
  children: string[];            // Ordered child node IDs
  metadata: {
    timestamp: number;
    model: string;               // e.g. "gpt-5.4"
    persona?: MathPersona;       // Which math flavor generated this
    sources?: Citation[];        // RAG sources used
    lean4Result?: Lean4Result;   // Optional verification result
  };
}

interface DialogueTree {
  id: string;
  title: string;                 // User-assigned or auto-generated
  rootId: string;
  activePath: string[];          // Node IDs from root to current leaf
  nodes: Record<string, DialogueNode>;
  createdAt: number;
  updatedAt: number;
}
```

### Math Personas

```typescript
type MathPersona =
  | 'algebraist' | 'analyst' | 'geometer'
  | 'topologist' | 'number-theorist' | 'logician'
  | 'custom';

interface PersonaConfig {
  id: MathPersona;
  label: string;
  systemPrompt: string;         // Shapes proof style and vocabulary
  preferredSources?: ('arxiv' | 'nlab' | 'wikipedia')[];
}
```

### Knowledge & Citations

```typescript
interface Citation {
  source: 'arxiv' | 'nlab' | 'wikipedia';
  title: string;
  url: string;
  snippet: string;              // Relevant excerpt
  bibtex?: string;              // For paper writing (arXiv)
  fetchedAt: number;
}

interface KnowledgeCache {
  queries: Record<string, Citation[]>;  // Query string -> results
  ttl: number;                          // Cache expiry (e.g. 24h)
}
```

### Lean4 Verification

```typescript
interface Lean4Result {
  status: 'success' | 'error' | 'timeout';
  leanCode: string;             // Generated Lean4 code
  diagnostics: string[];        // Error messages if failed
  verifiedAt: number;
}
```

### Paper Document

```typescript
interface PaperDocument {
  id: string;
  title: string;
  sections: PaperSection[];
  bibliography: Citation[];      // Aggregated from all source branches
  updatedAt: number;
}

interface PaperSection {
  id: string;
  heading: string;
  latex: string;                 // Raw LaTeX content
  sourceBranchIds: string[];     // Which dialogue branches fed this section
}
```

### Attached Papers (User-Curated Context)

```typescript
interface AttachedPaper {
  id: string;
  source: 'arxiv' | 'local-pdf' | 'local-tex';
  title: string;
  arxivId?: string;
  filePath?: string;
  extractedText: string;        // Full extracted content
  selectedSections?: string[];  // User-highlighted sections for narrower context
  scope: 'global' | 'branch';  // Applies to whole tree or specific branch
  branchId?: string;            // If scope is 'branch'
}
```

### Persistence

- **Dialogue trees** and **paper documents** stored as JSON files in the workspace under `.math-agent/trees/` and `.math-agent/papers/`
- **Knowledge cache** stored in VS Code's `globalState` (Memento API) to share across workspaces
- **User settings** (default persona, RAG toggle, Lean4 toggle, model preference) in VS Code settings under `mathAgent.*`
- **API keys** stored in VS Code's `SecretStorage` (not plain settings) for security

## Architecture

### High-Level Component Diagram

```
+--------------------------------------------------------------+
|                    VS Code Extension Host                     |
|                                                               |
|  +--------------+    +-----------------------------------+    |
|  | @math Chat   |    |   Math Research Panel (Webview)    |    |
|  | Participant  |<-->|  +-----------+  +------------+     |    |
|  |              |    |  | Research  |  | Write Tab  |     |    |
|  +--------------+    |  | Tab       |  | (LaTeX)    |     |    |
|                      |  +-----------+  +------------+     |    |
|                      +-----------------------------------+    |
|                                                               |
|  +-----------------------------------------------------------+|
|  |              Core Services Layer                           ||
|  |                                                            ||
|  |  +-------------+  +----------+  +-----------------+        ||
|  |  | LLM Service |  | Tree     |  | Paper Service   |        ||
|  |  | (multi-     |  | Manager  |  | (LaTeX gen)     |        ||
|  |  |  provider)  |  +----------+  +-----------------+        ||
|  |  +-------------+                                           ||
|  |                                                            ||
|  |  +-------------+  +----------+  +-----------------+        ||
|  |  | Persona     |  | Storage  |  | Citation        |        ||
|  |  | Manager     |  | Service  |  | Manager         |        ||
|  |  +-------------+  +----------+  +-----------------+        ||
|  |                                                            ||
|  |  +-------------+  +----------+  +-----------------+        ||
|  |  | Context     |  |Attached  |  | Entity          |        ||
|  |  | Builder     |  |Paper Mgr |  | Detector        |        ||
|  |  +-------------+  +----------+  +-----------------+        ||
|  |                                                            ||
|  |  +-----------------------------------------------------+  ||
|  |  |          Knowledge Service (RAG)                      | ||
|  |  |  +---------+  +----------+  +---------------+        | ||
|  |  |  | arXiv   |  | Wikipedia|  | nLab Scraper  |        | ||
|  |  |  | Client  |  | Client   |  | + Cache       |        | ||
|  |  |  +---------+  +----------+  +---------------+        | ||
|  |  +-----------------------------------------------------+  ||
|  |                                                            ||
|  |  +-----------------------------------------------------+  ||
|  |  |          Lean4 Service (Optional)                     | ||
|  |  |  LSP Client <--> Local Lean4 Installation             | ||
|  |  +-----------------------------------------------------+  ||
|  +-----------------------------------------------------------+|
+--------------------------------------------------------------+
```

### LLM Service (Multi-Provider)

Supports four providers with a unified interface:

| Provider | SDK | Model Default |
|----------|-----|---------------|
| VS Code LM API | `vscode.lm.selectChatModels()` | Auto-select |
| OpenAI | `openai` npm package | GPT-5.4 |
| Anthropic | `@anthropic-ai/sdk` | Claude Opus 4.6 |
| Google | `@google/generative-ai` | Gemini 3.1 Pro |

API keys stored in `SecretStorage`. Model selector dropdown in Research Panel header allows switching provider/model mid-session. Each dialogue node records which model generated it.

Settings:
```json
{
  "mathAgent.llm.provider": "openai",
  "mathAgent.llm.openaiModel": "gpt-5.4",
  "mathAgent.llm.anthropicModel": "claude-opus-4-6",
  "mathAgent.llm.googleModel": "gemini-3.1-pro"
}
```

### Communication Patterns

**Chat Participant <-> Core Services:**
- Chat Participant receives user prompts, calls LLM Service with persona system prompt
- Knowledge Service is registered as an LM Tool -- the LLM can invoke it autonomously during chat
- Results stream back as markdown with LaTeX

**Webview Panel <-> Extension Host:**
- All communication via `postMessage` / `onDidReceiveMessage`
- Webview sends typed actions: `{ type: 'fork', nodeId: '...' }`, `{ type: 'send', message: '...', branchId: '...' }`
- Extension host sends typed state updates: `{ type: 'nodeAdded', node: {...} }`, `{ type: 'streamChunk', text: '...' }`
- Webview never calls APIs directly -- all data flows through the extension host

**Chat Participant -> Webview escalation:**
- `@math open studio` triggers `vscode.commands.executeCommand('mathAgent.openPanel')`
- Current chat context can be passed to initialize a new tree root

### LLM Context Assembly

When sending a prompt from a branch, the context is built as:

1. **System prompt** -- persona-specific instructions
2. **Attached papers** -- user-curated persistent context (full text or selected sections)
3. **Path context** -- all messages from root -> current branch point (the conversation history for this branch)
4. **RAG context** -- auto-fetched knowledge snippets (if toggled on)
5. **User message** -- the new prompt

This ensures each branch gets coherent context without cross-contamination from sibling branches.

### Multi-Agent Flow

When "Multi-agent" persona is selected:

1. User prompt is sent to 2-3 persona-specific LLM calls in parallel
2. Each returns an independent response
3. Responses rendered side-by-side in the Research tab as labeled cards ("Algebraist says...", "Analyst says...")
4. User can promote any response to become a branch, or fork from each independently

### Paper Context Configuration

Users can attach specific papers as persistent context:

- **Drag-and-drop** PDF/`.tex` into the Research Panel
- **Paste arXiv ID** (e.g. `2505.23754`) -- extension auto-fetches abstract + full text
- **"Add paper" button** -> file picker or arXiv ID input
- Attached papers appear as a collapsible sidebar list, toggleable per-branch or globally for the tree
- Users can highlight specific sections to narrow the injected context

Attached papers are **persistent, user-curated context**, while RAG results are **ephemeral, auto-detected context**.

## Edge Cases & Error Handling

### LLM Failures

| Scenario | Handling |
|----------|----------|
| Model unavailable (no subscription, quota exceeded) | Show inline error with options: "Switch model", "Add API key", or "Retry". Never silently fail. |
| Streaming interrupted (network drop mid-response) | Preserve partial response in the node, mark with warning "Incomplete". User can "Regenerate" from that node. |
| Rate limiting (premium request quota) | Queue requests, show "Waiting..." indicator. Suggest switching to a lighter model for simple queries. |
| Context window overflow (deep branch + many attached papers) | Warn user before sending. Auto-summarize older messages in the path. Show token count indicator in the UI. |
| No LLM configured at all | First-run onboarding: "Choose your LLM provider" with four options. |
| API key invalid/expired | Inline error with "Update API key in settings" action button. |

### Knowledge Source Failures

| Scenario | Handling |
|----------|----------|
| arXiv API down or rate-limited | Fall back gracefully -- show "arXiv unavailable" pill, continue with other sources. Cache aggressively (24h TTL). |
| nLab page not found | Suggest similar page names (fuzzy match against local title index). Show "Page not found on nLab" inline. |
| Wikipedia returns irrelevant results | LLM filters results for math relevance before injecting into context. User can dismiss individual sources. |
| Attached PDF parsing fails | Show error: "Could not extract text from [filename]. Try a `.tex` file instead." Support falls back to OCR if available. |

### Branching Tree Edge Cases

| Scenario | Handling |
|----------|----------|
| Very deep trees (50+ nodes in a path) | Context summarization kicks in -- older messages compressed to summaries. Breadcrumb remains fully navigable. |
| Very wide trees (many sibling branches) | Collapsed by default beyond 5 siblings. Show "+N more branches" expander. |
| Switching branches during streaming | Cancel current stream, preserve partial response, switch to selected branch. |
| Deleting a branch with children | Confirmation dialog: "This branch has N sub-branches. Delete all?" No silent cascade deletes. |
| Concurrent edits in Write tab + Research tab | Write tab sections track their `sourceBranchIds`. If a source branch changes, show a subtle "Source updated -- refresh?" indicator. |

### Lean4 Integration

| Scenario | Handling |
|----------|----------|
| Lean4 not installed | "Verify" button shows tooltip: "Lean4 not detected. Install Lean4 to enable verification." Link to installation guide. |
| Lean4 verification timeout | 60s default timeout. Show "Verification timed out -- the statement may need simplification." Allow retry with longer timeout. |
| Generated Lean4 code is invalid | Show the LLM-generated code alongside Lean4 diagnostics. Offer "Fix and retry" which feeds errors back to the LLM for correction (up to 3 attempts). |

### Data & Storage

| Scenario | Handling |
|----------|----------|
| Workspace has no `.math-agent/` folder | Auto-create on first use. No user action needed. |
| Corrupt tree JSON | Detect on load, show "Tree [name] could not be loaded." Offer to open raw JSON for manual recovery. Keep a `.backup` copy on every save. |
| Large trees (>5MB JSON) | Warn user. Suggest archiving completed branches. Lazy-load nodes outside the active path. |

## Testing Strategy

### 1. Unit Tests (target: 80%+ coverage)

**Framework:** Mocha + Chai (VS Code extension standard) or Vitest for the React webview

| Component | What to test |
|-----------|-------------|
| Tree Manager | Node creation, forking, branch switching, path assembly, deletion with cascading children |
| Context Builder | Correct message ordering from root -> leaf, summarization triggers at depth limits, attached paper injection |
| Persona Manager | System prompt generation per persona, multi-agent prompt fan-out |
| Citation Manager | BibTeX generation from arXiv metadata, deduplication across branches, cache TTL expiry |
| Knowledge Clients | arXiv XML parsing, Wikipedia JSON parsing, nLab HTML extraction (use saved fixture responses) |
| LLM Service | Provider switching, API key validation, request construction per provider (OpenAI/Anthropic/Google/LM API), streaming chunk assembly |
| Storage Service | Save/load tree JSON, backup creation, corrupt file detection |

### 2. Integration Tests

| Scenario | How |
|----------|-----|
| Chat Participant -> Core Services | VS Code Extension Test Runner (`@vscode/test-electron`). Simulate `@math` prompts, verify correct service calls. |
| Webview <-> Extension Host | Mock `postMessage` channel. Send typed actions from webview, assert correct state updates returned. |
| Knowledge RAG pipeline | Mock HTTP responses (arXiv, Wikipedia, nLab). Verify entity detection -> fetch -> context injection end-to-end. |
| LLM provider fallback | Simulate API failures per provider, verify graceful switching and error messages. |
| Tree persistence round-trip | Create tree -> save to disk -> reload -> verify identical structure. |

### 3. Webview UI Tests

**Framework:** React Testing Library + Vitest for the React app inside the webview

| Scenario | What to verify |
|----------|---------------|
| Branch rendering | Active branch highlighted, siblings dimmed, correct nesting |
| Fork interaction | Click "Branch from here" -> new input appears, tree updates |
| Branch switching | Click dimmed branch -> becomes active, previous dims, breadcrumb updates |
| KaTeX rendering | LaTeX strings render as math, broken LaTeX shows graceful fallback (raw text) |
| Persona selector | Switching persona updates system prompt, multi-agent shows parallel cards |
| Write tab | "Draft from branch" populates LaTeX, split view renders preview |

### 4. E2E Tests (Critical Flows)

**Framework:** `@vscode/test-electron` for full extension lifecycle

| Flow | Steps |
|------|-------|
| First-run onboarding | Install extension -> no LLM configured -> onboarding prompt -> enter API key -> first query succeeds |
| Research exploration | Open panel -> ask question -> get response -> fork -> develop two branches -> switch between them |
| RAG pipeline | Toggle RAG on -> type a message mentioning "spectral sequence" -> verify arXiv/nLab/Wikipedia fetched and shown |
| Paper drafting | Develop a proof branch -> "Draft as paper section" -> verify LaTeX generated in Write tab with citations |
| Lean4 verification | Enable Lean4 -> click "Verify" on a proof step -> verify Lean4 invoked and result displayed |

### 5. What NOT to Test

- LLM response quality (non-deterministic -- that's prompt engineering, not testing)
- Actual arXiv/nLab/Wikipedia uptime (use mocks; test real endpoints only in manual smoke tests)
- KaTeX rendering correctness (trust the library; test our integration, not KaTeX itself)

## Open Questions

- Should multi-agent responses count as separate branches automatically, or only when the user explicitly promotes one?
- How to handle token budget allocation between attached papers, path context, and RAG results when approaching context limits?
- Should the Write tab support collaborative editing (multiple users) in a future version?
- What is the best chunking strategy for attached papers to maximize relevance while staying within context windows?
- Should we build a local vector index of nLab page titles for fuzzy entity matching, or rely on keyword search?

## Next Steps

Run `/quantum-loop:ql-spec` to generate a formal Product Requirements Document from this design.
