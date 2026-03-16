declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'

  interface TexmathOptions {
    readonly engine: {
      readonly renderToString: (
        tex: string,
        options?: Record<string, unknown>
      ) => string
    }
    readonly delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown'
    readonly katexOptions?: {
      readonly throwOnError?: boolean
      readonly displayMode?: boolean
      readonly macros?: Record<string, string>
    }
  }

  function texmath(md: MarkdownIt, options?: TexmathOptions): void

  export = texmath
}
