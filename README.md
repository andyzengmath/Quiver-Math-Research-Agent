# Math Research Agent

A VS Code extension that unifies the mathematical research workflow -- from idea exploration to proof development to paper writing -- in a single tool.

## Features

### `@math` Chat Participant
Type `@math` in Copilot Chat for quick math queries with LaTeX rendering.

- `@math what is a derived category?` -- definitions with auto-fetched context
- `@math /search homological stability` -- search arXiv, Wikipedia, nLab
- `@math /arxiv spectral sequences` -- arXiv-specific search with BibTeX
- `@math /studio` -- open the Research Studio panel

### Research Studio (Branching Dialogue)
A webview panel for deep, non-linear exploration:

- **Branching conversations** -- fork from any message to explore alternative ideas. Active branch is highlighted; sibling branches appear dimmed.
- **Math personas** -- select from algebraist, analyst, geometer, topologist, number-theorist, or logician. Each shapes the LLM's proof strategies and vocabulary.
- **Multi-agent mode** -- send a question to multiple personas in parallel, get individual perspectives plus a synthesized answer.
- **RAG auto-retrieval** -- math entities are detected and looked up across arXiv, nLab, and Wikipedia automatically (toggleable).
- **Attached papers** -- drag-and-drop PDFs, `.tex` files, or paste arXiv IDs to inject paper context into the conversation.
- **Lean4 verification** -- optionally verify proof steps against a local Lean4 installation.
- **Session management** -- create, rename, switch between, and delete research sessions.

### Write Tab (Paper Assistant)
Draft paper sections from your research and inject them into `.tex` files:

- Select a `.tex` file and see its section structure
- "Draft from branch" generates LaTeX from a research conversation
- Insert content at any section position using VS Code's WorkspaceEdit API
- Citations auto-formatted as `\cite{}` with BibTeX appended to `.bib` files

## LLM Providers

Supports four providers via the VS Code Language Model API or direct API keys:

| Provider | Default Model | Config Key |
|----------|--------------|------------|
| VS Code Copilot | Auto-select | No key needed |
| OpenAI | GPT-5.4 | `mathAgent.llm.openaiModel` |
| Anthropic | Claude Opus 4.6 | `mathAgent.llm.anthropicModel` |
| Google AI | Gemini 3.1 Pro | `mathAgent.llm.googleModel` |

API keys are stored securely in VS Code's SecretStorage. A guided onboarding wizard runs on first activation.

## Getting Started

1. Install the extension from the VS Code Marketplace (or build from source)
2. On first launch, the onboarding wizard guides you through provider setup
3. Type `@math` in Copilot Chat, or open the Research Studio via the command palette (`Math Research Agent: Open Panel`)

### Building from Source

```bash
git clone https://github.com/andyzengmath/Math-research-agent.git
cd Math-research-agent
npm install
npm run compile
npm run build:webview
```

Press `F5` in VS Code to launch the Extension Development Host.

### Running Tests

```bash
npm run test:unit      # Mocha unit tests (243 tests)
npm run test:webview   # Vitest + React Testing Library
```

## Architecture

```
src/
  extension.ts           # Activation, command registration
  services.ts            # Service factory (createServices)
  onboarding.ts          # First-run setup wizard
  llm/                   # Multi-provider LLM abstraction
    types.ts             # LlmProvider interface, error types
    service.ts           # LlmService registry
    providers/           # OpenAI, Anthropic, Google, VS Code LM
  dialogue/              # Branching conversation data model
    types.ts             # DialogueNode, DialogueTree, AttachedPaper
    tree.ts              # TreeManager (CRUD, fork, branch switch)
    storage.ts           # JSON persistence to .math-agent/
    context.ts           # ContextBuilder (path assembly, trimming)
  knowledge/             # RAG knowledge retrieval
    arxiv.ts             # arXiv API client
    wikipedia.ts         # Wikipedia MediaWiki API client
    nlab.ts              # nLab HTML scraper
    cache.ts             # Query result cache (24h TTL)
    entity-detector.ts   # Math entity detection (keyword + LLM)
    rag-orchestrator.ts  # Parallel source querying
  persona/               # Math persona system
    manager.ts           # 6 built-in + custom personas
  lean4/                 # Optional Lean4 integration
    service.ts           # Binary detection, verification
  papers/                # Paper attachment + TeX parsing
    manager.ts           # PDF/TeX/arXiv text extraction
    tex-parser.ts        # Section parsing, .bib detection
  chat/                  # Copilot Chat integration
    participant.ts       # @math chat participant
    multi-agent.ts       # Parallel persona orchestration
  webview/               # Research Studio panel
    panel.ts             # WebviewPanel lifecycle
    protocol.ts          # Typed message protocol
    message-handler.ts   # Handler registry pattern
    handlers/            # Feature-specific handlers
      send-handler.ts    # Message send + streaming
      branch-handler.ts  # Fork, switch, delete branches
      persona-handler.ts # Persona selection
      model-handler.ts   # Provider/model switching
      paper-handler.ts   # Paper attachment management
      lean4-handler.ts   # Lean4 verification UI
      write-handler.ts   # Paper drafting + file injection
      tree-handler.ts    # Session CRUD
webview-ui/              # React app for the webview
  src/
    App.tsx              # Tab navigation (Research / Write)
    components/          # UI components
    hooks/               # Custom React hooks
    utils/               # Markdown + KaTeX rendering
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mathAgent.llm.provider` | `openai` | Active LLM provider |
| `mathAgent.llm.openaiModel` | `gpt-5.4` | OpenAI model |
| `mathAgent.llm.anthropicModel` | `claude-opus-4-6` | Anthropic model |
| `mathAgent.llm.googleModel` | `gemini-3.1-pro` | Google AI model |
| `mathAgent.defaultPersona` | `algebraist` | Default math persona |
| `mathAgent.rag.enabled` | `true` | Auto-retrieve from knowledge sources |
| `mathAgent.rag.cacheTtlHours` | `24` | Knowledge cache TTL |
| `mathAgent.lean4.enabled` | `false` | Enable Lean4 verification |
| `mathAgent.lean4.timeoutMs` | `60000` | Lean4 verification timeout |
| `mathAgent.multiAgent.personas` | `["algebraist","analyst","geometer"]` | Personas for multi-agent mode |

## Data Storage

Research sessions are stored as JSON in `.math-agent/trees/` within your workspace. This directory is auto-added to `.gitignore`. Context trimming memory files are saved to `.math-agent/trees/{treeId}/memory/`.

## License

MIT
