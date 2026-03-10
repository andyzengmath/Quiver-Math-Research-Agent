import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useWebviewMessage } from '../hooks/useWebviewMessage'
import { renderMathMarkdown } from '../utils/renderMarkdown'
import type { TexFile, TexStructureItem, HostToWebview } from '../types'
import './WriteTab.css'

export function WriteTab(): React.ReactElement {
  const { lastMessage, postMessage } = useWebviewMessage()

  const [texFiles, setTexFiles] = useState<ReadonlyArray<TexFile>>([])
  const [selectedFile, setSelectedFile] = useState<string>('')
  const [texStructure, setTexStructure] = useState<ReadonlyArray<TexStructureItem>>([])
  const [draftContent, setDraftContent] = useState<string>('')
  const [chatInput, setChatInput] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // Request .tex files on mount
  useEffect(() => {
    postMessage({ type: 'getTexFiles' })
  }, [postMessage])

  // Handle incoming messages from extension host
  useEffect(() => {
    if (!lastMessage) {
      return
    }

    const msg: HostToWebview = lastMessage

    if (msg.type === 'texFiles') {
      setTexFiles(msg.files)
      if (msg.files.length > 0 && !selectedFile) {
        const firstPath = msg.files[0].path
        setSelectedFile(firstPath)
        postMessage({ type: 'selectTexFile', filePath: firstPath })
      }
    }

    if (msg.type === 'texStructure') {
      setTexStructure(msg.structure)
    }

    if (msg.type === 'draftResult') {
      setDraftContent(msg.latex)
      setIsLoading(false)
    }
  }, [lastMessage, postMessage, selectedFile])

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const filePath = event.target.value
      setSelectedFile(filePath)
      setTexStructure([])
      if (filePath) {
        postMessage({ type: 'selectTexFile', filePath })
      }
    },
    [postMessage]
  )

  const handleInsert = useCallback(
    (lineNumber: number) => {
      if (!selectedFile || !draftContent) {
        return
      }
      postMessage({
        type: 'insertIntoFile',
        filePath: selectedFile,
        afterLine: lineNumber,
        content: draftContent,
      })
    },
    [selectedFile, draftContent, postMessage]
  )

  const handleChatSend = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed) {
      return
    }
    setIsLoading(true)
    postMessage({ type: 'draftFromBranch', branchNodeId: trimmed })
    setChatInput('')
  }, [chatInput, postMessage])

  const handleChatKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleChatSend()
      }
    },
    [handleChatSend]
  )

  const renderedDraft = useMemo(() => {
    if (!draftContent) {
      return ''
    }
    return renderMathMarkdown(draftContent)
  }, [draftContent])

  return (
    <div className="write-tab">
      {/* File Selector */}
      <div className="write-file-selector">
        <label htmlFor="tex-file-select">TeX File:</label>
        <select
          id="tex-file-select"
          className="write-select"
          value={selectedFile}
          onChange={handleFileSelect}
        >
          <option value="">-- Select a .tex file --</option>
          {texFiles.map((file) => (
            <option key={file.path} value={file.path}>
              {file.name}
            </option>
          ))}
        </select>
      </div>

      {/* Section Outline */}
      {texStructure.length > 0 && (
        <div className="write-section-outline">
          <h4 className="write-section-title">Document Structure</h4>
          <ul className="write-section-list">
            {texStructure.map((item, index) => (
              <li
                key={`${item.line}-${index}`}
                className={`write-section-item write-section-level-${item.level}`}
              >
                <span className="write-section-label">{item.title}</span>
                <span className="write-section-line">L{item.line}</span>
                {draftContent && (
                  <button
                    type="button"
                    className="write-insert-button"
                    onClick={() => handleInsert(item.line)}
                    title={`Insert draft after line ${item.line}`}
                  >
                    Insert
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Draft Preview */}
      {draftContent && (
        <div className="write-draft-preview">
          <h4 className="write-section-title">Draft Preview</h4>
          <div
            className="write-draft-content"
            dangerouslySetInnerHTML={{ __html: renderedDraft }}
          />
        </div>
      )}

      {/* Loading Indicator */}
      {isLoading && (
        <div className="write-loading">Generating draft...</div>
      )}

      {/* Chat Input */}
      <div className="write-chat-area">
        <textarea
          className="write-chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={handleChatKeyDown}
          placeholder="Enter a topic or branch node ID to draft a section... (Shift+Enter for newline)"
          rows={3}
        />
        <button
          type="button"
          className="write-chat-send"
          onClick={handleChatSend}
          disabled={!chatInput.trim() || isLoading}
        >
          Draft
        </button>
      </div>
    </div>
  )
}
