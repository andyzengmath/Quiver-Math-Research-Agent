import * as fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { AttachedPaper } from '../dialogue/types'
import { ArxivClient } from '../knowledge/arxiv'

/**
 * Error thrown when PDF text extraction fails.
 */
export class PdfExtractionError extends Error {
  readonly filePath: string

  constructor(filePath: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause ?? 'unknown error')
    super(`Failed to extract text from PDF: ${filePath} - ${causeMsg}`)
    this.name = 'PdfExtractionError'
    this.filePath = filePath
  }
}

/**
 * Manages attaching papers (PDF, TeX, arXiv) to a research session.
 * Extracts text content and returns AttachedPaper objects for storage in the dialogue tree.
 */
export class PaperManager {
  /**
   * Attach a paper from a local file (.pdf or .tex).
   * Reads .tex as raw text; extracts text from .pdf using pdf-parse.
   * Throws PdfExtractionError if PDF extraction fails.
   */
  async attachFromFile(filePath: string): Promise<AttachedPaper> {
    const lowerPath = filePath.toLowerCase()

    if (lowerPath.endsWith('.tex')) {
      return this.attachTexFile(filePath)
    }

    if (lowerPath.endsWith('.pdf')) {
      return this.attachPdfFile(filePath)
    }

    throw new Error(`Unsupported file type: ${filePath}. Only .pdf and .tex files are supported.`)
  }

  /**
   * Attach a paper from arXiv by its ID.
   * Searches arXiv for the paper and returns an AttachedPaper with the abstract as extracted text.
   */
  async attachFromArxiv(arxivId: string, arxivClient: ArxivClient): Promise<AttachedPaper> {
    const normalizedId = arxivId.trim()
    if (!normalizedId) {
      throw new Error('arXiv ID cannot be empty')
    }

    const citations = await arxivClient.search(normalizedId, 1)

    if (citations.length === 0) {
      throw new Error(`No paper found on arXiv for ID: ${normalizedId}`)
    }

    const citation = citations[0]

    return {
      id: uuidv4(),
      source: 'arxiv',
      title: citation.title,
      arxivId: normalizedId,
      extractedText: citation.snippet,
      scope: 'global',
    }
  }

  private attachTexFile(filePath: string): AttachedPaper {
    const content = fs.readFileSync(filePath, 'utf-8')
    const title = this.extractTexTitle(content) ?? this.filenameFromPath(filePath)

    return {
      id: uuidv4(),
      source: 'local-tex',
      title,
      filePath,
      extractedText: content,
      scope: 'global',
    }
  }

  private async attachPdfFile(filePath: string): Promise<AttachedPaper> {
    // pdf-parse requires browser APIs (DOMMatrix, canvas) that don't exist in VS Code's
    // Node.js extension host. Lazy import to avoid crashing at startup, but still
    // provide a clear error if pdf-parse isn't available.
    let parser: { getText(): Promise<{ text: string }>; destroy(): Promise<void> } | undefined
    let PDFParseClass: typeof import('pdf-parse').PDFParse
    try {
      const mod = await import('pdf-parse')
      PDFParseClass = mod.PDFParse
    } catch {
      throw new PdfExtractionError(
        filePath,
        'PDF parsing is not available in this environment. Please use a .tex file instead, or paste an arXiv ID.'
      )
    }
    try {
      const buffer = fs.readFileSync(filePath)
      const data = new Uint8Array(buffer)
      parser = new PDFParseClass({ data })
      const textResult = await parser.getText()
      const extractedText = textResult.text

      if (!extractedText || extractedText.trim().length === 0) {
        throw new PdfExtractionError(filePath, 'PDF contained no extractable text')
      }

      const title = this.filenameFromPath(filePath)

      return {
        id: uuidv4(),
        source: 'local-pdf',
        title,
        filePath,
        extractedText,
        scope: 'global',
      }
    } catch (error) {
      if (error instanceof PdfExtractionError) {
        throw error
      }
      throw new PdfExtractionError(filePath, error)
    } finally {
      if (parser) {
        await parser.destroy().catch(() => {})
      }
    }
  }

  /**
   * Extracts the title from a TeX document by looking for \title{...}.
   */
  private extractTexTitle(content: string): string | undefined {
    const match = content.match(/\\title\{([^}]*)\}/)
    return match ? match[1].trim() : undefined
  }

  /**
   * Extracts the filename (without extension) from a file path.
   */
  private filenameFromPath(filePath: string): string {
    const segments = filePath.split(/[\\/]/)
    const filename = segments[segments.length - 1] ?? filePath
    return filename.replace(/\.[^.]+$/, '')
  }
}
