import markdownit from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'

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

const mdPlain = markdownit({
  html: false,
  linkify: true,
  typographer: false,
})

/**
 * Render a markdown string with LaTeX math support via KaTeX.
 * Inline math uses `$...$` and display math uses `$$...$$`.
 * Malformed LaTeX renders as raw text (graceful fallback).
 */
export function renderMathMarkdown(text: string): string {
  if (!text) {
    return ''
  }
  return md.render(text)
}

/**
 * Render markdown WITHOUT KaTeX math processing.
 * Use during streaming to avoid errors from incomplete LaTeX expressions
 * like unclosed `$` delimiters that cause the parser to swallow remaining text.
 */
export function renderPlainMarkdown(text: string): string {
  if (!text) {
    return ''
  }
  return mdPlain.render(text)
}
