import React, { Component, useState } from 'react'
import { ResearchTab } from './components/ResearchTab'
import { WriteTab } from './components/WriteTab'
import './App.css'

type TabId = 'research' | 'write'

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: 'red', fontFamily: 'monospace' }}>
          <h2>Math Research Agent Error</h2>
          <pre>{this.state.error.message}</pre>
          <pre>{this.state.error.stack}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('research')

  return (
    <ErrorBoundary>
      <div className="app-container">
        <div className="tab-header">
          <button
            className={`tab-button ${activeTab === 'research' ? 'active' : ''}`}
            onClick={() => setActiveTab('research')}
            type="button"
          >
            Research
          </button>
          <button
            className={`tab-button ${activeTab === 'write' ? 'active' : ''}`}
            onClick={() => setActiveTab('write')}
            type="button"
          >
            Write
          </button>
        </div>
        <div className="tab-content">
          <div style={{ display: activeTab === 'research' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <ResearchTab />
          </div>
          <div style={{ display: activeTab === 'write' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <WriteTab />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
