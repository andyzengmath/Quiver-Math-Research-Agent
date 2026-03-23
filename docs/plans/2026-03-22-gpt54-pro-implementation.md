# GPT-5.4 Pro Support: Implementation Notes & Issues

**Date:** 2026-03-22
**Context:** Notes from implementing Azure OpenAI GPT-5.4 Pro support in the Quiver Math Research Agent extension.

---

## Background

GPT-5.4 Pro is OpenAI's most capable reasoning model, released to the Responses API. It is NOT available through the Chat Completions API. This is a deliberate design choice by OpenAI — the Responses API is their new standard for advanced models and supports features like multi-turn reasoning, built-in tools, and improved cache utilization.

### Key Facts

| Property | GPT-5.4 (standard) | GPT-5.4 Pro |
|----------|-------------------|-------------|
| Chat Completions API | Yes | **No** |
| Responses API | Yes | **Yes (only)** |
| Reasoning effort | none, low, medium, high, xhigh | medium, high, xhigh |
| Cost | Standard | Higher (more compute) |
| Performance | Strong | ~3% better (SWE-bench) |
| Cache utilization | Standard | 40-80% improvement |

Sources:
- [Using GPT-5.4 (OpenAI)](https://developers.openai.com/api/docs/guides/latest-model/)
- [GPT-5.4 Pro Model (OpenAI)](https://developers.openai.com/api/docs/models/gpt-5.4-pro)
- [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses)

---

## Issues Encountered

### Issue 1: "The chatCompletion operation does not work with the specified model"

**Error:** `400 The chatCompletion operation does not work with the specified model, gpt-5.4-pro`

**Root cause:** GPT-5.4 Pro only supports the Responses API endpoint (`/responses`), not Chat Completions (`/chat/completions`). The Azure OpenAI API returns a 400 error with this specific message.

**Fix:** Auto-detect this error and fall back to the Responses API:
```typescript
try {
  yield* this.streamChatCompletions(client, deployment, messages, options)
} catch (err) {
  if (err.message.includes('does not work with the specified model')) {
    yield* this.streamResponses(client, deployment, messages, options)
    return
  }
  throw this.mapError(err)
}
```

### Issue 2: "Cannot read properties of undefined (reading 'create')"

**Error:** `Cannot read properties of undefined (reading 'create')` on `client.responses.create()`

**Root cause (attempt 1 — wrong):** Initial diagnosis was that the `AzureOpenAI` client created for Chat Completions didn't have `.responses`. Tried casting the existing client.

**Root cause (attempt 2 — wrong):** Thought the api-version was too old. The Chat Completions client used `2024-12-01-preview` and the Responses API needs `2025-04-01-preview`. Created a new `AzureOpenAI` client with the correct api-version.

**Root cause (attempt 3 — correct):** The `openai` npm package version 4.77.0 simply did NOT have the Responses API at all. The `client.responses` property was `undefined` because the class didn't implement it. The Responses API was added in openai SDK v5+.

**Fix:** Upgraded `openai` from v4.77.0 to v6.32.0:
```
npm install openai@latest
```

**Lesson learned:** Always check the SDK version first. The API may exist on the server side but the client library needs to support it.

### Issue 3: API Version Mismatch

**Problem:** Even with the correct SDK, the Responses API requires `apiVersion: '2025-04-01-preview'` or newer on Azure. The existing Chat Completions client was created with `2024-12-01-preview`.

**Fix:** Create a separate `AzureOpenAI` client specifically for Responses API calls with `apiVersion: '2025-04-01-preview'`, rather than reusing the Chat Completions client:

```typescript
const RESPONSES_API_VERSION = '2025-04-01-preview'
const responsesClient = new AzureOpenAI({
  endpoint,
  deployment,
  apiVersion: RESPONSES_API_VERSION,
  azureADTokenProvider: tokenProvider, // or apiKey
})
const stream = await responsesClient.responses.create({ model, input, stream: true })
```

### Issue 4: Responses API Input Format Differs from Chat Completions

**Difference:** Chat Completions uses `messages` array, Responses API uses `input` array. The role/content format is the same, but the parameter name differs.

| Parameter | Chat Completions | Responses API |
|-----------|-----------------|---------------|
| Messages | `messages: [{role, content}]` | `input: [{role, content}]` |
| Model | `model: 'deployment-name'` | `model: 'deployment-name'` |
| Max tokens | `max_tokens: N` | `max_output_tokens: N` |
| Reasoning | `reasoning_effort: 'high'` | `reasoning: { effort: 'high' }` |
| Stream chunks | `chunk.choices[0].delta.content` | `event.delta` (for `response.output_text.delta`) |

### Issue 5: Stale Build Artifacts

**Problem:** Edits to source files in the OneDrive repo didn't propagate to the dev build directory (`C:\dev\math-agent`). The VSIX was built from stale sources.

**Root cause:** The dev and source directories were separate (due to OneDrive path-with-spaces issue). Changes made in one weren't automatically reflected in the other.

**Fix:** Always explicitly copy source files before building:
```bash
cp -r "C:/Users/.../Math-research-agent/src" /c/dev/math-agent/src
cd /c/dev/math-agent && node esbuild.extension.js
```

**Lesson learned:** Having two copies of the codebase is error-prone. The build pipeline should be unified.

---

## Architecture: How Responses API Fallback Works

```
User sends message
        │
        ▼
┌─────────────────────┐
│  tryStreamWithFallback │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐     Success
│ streamChatCompletions │ ──────────→ yield chunks
│ (api-version from    │
│  user config)        │
└──────┬──────────────┘
       │ Fails with "model not supported"
       ▼
┌─────────────────────┐
│ Create NEW client    │
│ apiVersion:          │
│ 2025-04-01-preview   │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐     Success
│ streamResponses      │ ──────────→ yield chunks
│ (Responses API)      │
└──────┬──────────────┘
       │ Fails
       ▼
    mapError → throw
```

The fallback is transparent to the user — they don't need to know which API is being used. The only visible difference is that GPT-5.4 Pro may take longer to respond (more reasoning compute).

---

## Recommendations for Future Development

1. **Default to Responses API**: OpenAI recommends the Responses API for all new projects. Consider making it the primary API and falling back to Chat Completions only for older models.

2. **Expose reasoning tokens**: The Responses API returns reasoning tokens in the stream. These could be shown in the "thinking" indicator with more detail than our current random math messages.

3. **Support `reasoning.effort` properly**: The Responses API uses `reasoning: { effort: 'high' }` (nested object), not `reasoning_effort: 'high'` (flat). Currently we handle both in the respective methods.

4. **Cache the Responses API client**: Currently we create a new `AzureOpenAI` client for every Responses API call. Consider caching it alongside the Chat Completions client.

5. **Pin the openai SDK version**: The v4→v6 upgrade was seamless this time, but major version bumps can break things. Pin to `^6.32.0` in package.json.

6. **Unify the build pipeline**: The two-directory problem (OneDrive + dev) caused multiple bugs where fixes weren't propagated. Consider using a single build location or a proper build script.
