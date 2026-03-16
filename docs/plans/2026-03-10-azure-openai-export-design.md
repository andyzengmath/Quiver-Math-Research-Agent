# Design: Azure OpenAI Support + Chat Export

**Date:** 2026-03-10
**Status:** Approved
**Features:** Azure OpenAI provider (API key + Managed Identity), Chat export (Markdown + HTML/PDF)

## Overview

Two new features for the Quiver: Math Research Agent extension:

1. **Azure OpenAI Provider** — a new `azure-openai` provider option with support for API key authentication and Microsoft Entra Managed Identity (via `@azure/identity` DefaultAzureCredential). Includes deployment auto-discovery from the Azure endpoint.

2. **Chat Export** — export research conversations as Markdown (with raw LaTeX) or HTML (with KaTeX-rendered math). Supports exporting the active branch, full tree, or from a specific message. HTML files are self-contained and can be printed to PDF from any browser.

## Azure OpenAI Provider

### Architecture

A new `AzureOpenAiProvider` class implementing `LlmProvider`, registered as `azure-openai`.

**Authentication modes** controlled by `mathAgent.llm.azureAuthMethod`:
- `api-key` — reads key from SecretStorage under `azure-openai-api-key`
- `managed-identity` — uses `@azure/identity` DefaultAzureCredential to get a bearer token for `https://cognitiveservices.azure.com/.default`. Auto-chains through: environment variables, managed identity (Azure VMs), Azure CLI (`az login`), and other credential sources.

**Implementation:** Uses the `openai` npm package's `AzureOpenAI` client class, which handles Azure-specific URL routing and auth headers. For managed identity, fetches a token from DefaultAzureCredential and passes it via the `azureADTokenProvider` option.

**Dependency:** `@azure/identity` added as a lazy import (same pattern as pdf-parse) — only loaded when managed identity auth is selected.

### Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mathAgent.llm.azureEndpoint` | string | `""` | Azure resource URL (e.g., `https://my-resource.openai.azure.com/`) |
| `mathAgent.llm.azureDeployment` | string | `""` | Deployment name (replaces model ID) |
| `mathAgent.llm.azureAuthMethod` | enum | `api-key` | `api-key` or `managed-identity` |
| `mathAgent.llm.azureApiVersion` | string | `2024-12-01-preview` | Azure API version |

### Onboarding Wizard Flow

When user selects "Azure OpenAI" in the provider picker:

1. **Enter endpoint URL** — input box, validates `https://` prefix
2. **Choose auth method** — QuickPick: "API Key" / "Managed Identity (Microsoft Entra)"
3. **Enter API key** (if API Key auth) — secure input, stored in SecretStorage
4. **Auto-fetch deployment list** — calls `GET {endpoint}/openai/deployments?api-version=...`, shows QuickPick dropdown with entries like `gpt-5-4-deployment (gpt-5.4) -- Succeeded`. Falls back to manual text input if API call fails.
5. **Test connection** — sends simple prompt. On success, saves settings. On failure, "Try again" / "Skip".

## Chat Export

### Entry Points

**Research tab header:** "Export" button with dropdown:
- Export active branch as Markdown
- Export full tree as Markdown
- Export active branch as HTML
- Export full tree as HTML

**Right-click context menu on messages:** Adds:
- Export from here as Markdown
- Export from here as HTML

### Markdown Format

```markdown
# Research Session: {tree title}
**Date:** {timestamp}
**Persona:** {active persona}
**Model:** {model name}

---

**User:** What approaches exist for proving Serre spectral sequence convergence?

**Assistant:** The Serre spectral sequence converges under...

> Sources: [arXiv: 2301.12345](url), [nLab: spectral sequence](url)

---

**User:** Let's explore the filtration approach.

**Assistant:** The filtration approach uses...
```

- LaTeX preserved as raw `$...$` and `$$...$$` (VS Code markdown preview renders natively)
- RAG citations as blockquotes with links
- Branch points annotated with `<!-- Branch: N siblings -->` comments
- Full tree export uses heading levels for branch structure

### HTML Format

- Rendered via existing `markdown-it` + KaTeX pipeline (`renderMathMarkdown()`)
- Wrapped in full HTML document with:
  - Inlined KaTeX CSS (self-contained, no external dependencies)
  - VS Code-inspired dark/light theme styles
  - Proper print margins for PDF printing
- User can open in browser and Print > Save as PDF

### File Output

Saved via `vscode.window.showSaveDialog` with suggested filename `{tree-title}-{date}.md` or `.html`.

## Implementation Plan

### New Files

- `src/llm/providers/azure-openai.ts` — AzureOpenAiProvider class
- `src/test/llm/providers/azure-openai.test.ts` — unit tests
- `src/export/markdown.ts` — markdown export builder
- `src/export/html.ts` — HTML export with inlined KaTeX
- `src/webview/handlers/export-handler.ts` — handles export messages

### Modified Files

- `src/services.ts` — register AzureOpenAiProvider
- `src/onboarding.ts` — add Azure OpenAI wizard flow with deployment listing
- `src/webview/protocol.ts` — add export message types
- `webview-ui/src/types.ts` — mirror protocol changes
- `webview-ui/src/components/ResearchTab.tsx` — add Export button + context menu items
- `webview-ui/src/components/MessageBubble.tsx` — add export context menu items
- `webview-ui/src/components/MessageList.css` — export button styles
- `package.json` — add Azure settings, `@azure/identity` dependency

### Dependencies

- `@azure/identity` — lazy imported (managed identity only)
- No new dependencies for export (reuses `markdown-it` + `katex`)

## Next Steps

Run `/quantum-loop:ql-spec` to generate a formal PRD from this design.
