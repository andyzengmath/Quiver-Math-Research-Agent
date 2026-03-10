import React, { useState } from 'react'
import { ResearchTab } from './components/ResearchTab'
import { WriteTab } from './components/WriteTab'
import './App.css'

type TabId = 'research' | 'write'

export function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>('research')

  return (
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
        {activeTab === 'research' ? <ResearchTab /> : <WriteTab />}
      </div>
    </div>
  )
}
