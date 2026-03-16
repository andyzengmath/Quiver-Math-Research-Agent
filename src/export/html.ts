import markdownit from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { DialogueTree } from '../dialogue/types'
import { exportToMarkdown, ExportOptions } from './markdown'

/**
 * KaTeX CDN stylesheet URL for rendering LaTeX in exported HTML.
 */
const KATEX_CDN_CSS = 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css'

/**
 * Inline CSS styles for the exported HTML document.
 * Dark theme by default, with @media print overrides for white bg / black text.
 */
const INLINE_CSS = `
    body {
      background-color: #1e1e1e;
      color: #d4d4d4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      line-height: 1.6;
      padding: 2rem;
    }
    .content {
      max-width: 800px;
      margin: 0 auto;
    }
    pre {
      background-color: #2d2d2d;
      padding: 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    code {
      font-family: 'Fira Code', 'Consolas', monospace;
    }
    blockquote {
      border-left: 3px solid #555;
      padding-left: 1rem;
      color: #aaa;
    }
    hr {
      border: none;
      border-top: 1px solid #444;
      margin: 1.5rem 0;
    }
    a {
      color: #569cd6;
    }
    @media print {
      body {
        background-color: #ffffff;
        color: #000000;
      }
      pre {
        background-color: #f5f5f5;
      }
      blockquote {
        color: #333;
      }
      a {
        color: #0066cc;
      }
    }
`

/**
 * Creates a configured markdown-it instance with KaTeX math rendering.
 * Mirrors the webview rendering pipeline from webview-ui/src/utils/renderMarkdown.ts.
 */
function createMarkdownRenderer(): markdownit {
  const md = markdownit({
    html: false,
    linkify: true,
    typographer: false,
  })

  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
    katexOptions: {
      throwOnError: false,
      displayMode: false,
    },
  })

  return md
}

/**
 * Wraps rendered HTML content in a full HTML document template.
 */
function wrapInHtmlTemplate(renderedContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${KATEX_CDN_CSS}">
  <style>${INLINE_CSS}</style>
</head>
<body>
  <div class="content">
${renderedContent}
  </div>
</body>
</html>`
}

/**
 * Exports a DialogueTree to a self-contained HTML document.
 *
 * Pipeline:
 * 1. Calls exportToMarkdown(tree, options) to produce markdown text
 * 2. Renders markdown via markdown-it with KaTeX plugin for LaTeX math
 * 3. Wraps the rendered HTML in a full document template with:
 *    - DOCTYPE, html lang="en"
 *    - charset and viewport meta tags
 *    - KaTeX CDN stylesheet link
 *    - Inline CSS with dark theme and @media print overrides
 *    - Body with div.content wrapper
 *
 * @param tree - The dialogue tree to export
 * @param options - Export options (mode and optional fromNodeId)
 * @returns A complete HTML document string
 */
export function exportToHtml(tree: DialogueTree, options: ExportOptions): string {
  const markdown = exportToMarkdown(tree, options)
  const md = createMarkdownRenderer()
  const renderedContent = md.render(markdown)
  return wrapInHtmlTemplate(renderedContent)
}
