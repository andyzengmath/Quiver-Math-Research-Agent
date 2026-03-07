import { useState, useEffect, useCallback, useRef } from 'react'
import type { HostToWebview, WebviewToHost } from '../types'

interface VsCodeApi {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

let vscodeApi: VsCodeApi | null = null

function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi()
  }
  return vscodeApi
}

export interface UseWebviewMessageResult {
  readonly lastMessage: HostToWebview | null
  readonly postMessage: (msg: WebviewToHost) => void
}

export function useWebviewMessage(): UseWebviewMessageResult {
  const [lastMessage, setLastMessage] = useState<HostToWebview | null>(null)
  const apiRef = useRef<VsCodeApi | null>(null)

  useEffect(() => {
    apiRef.current = getVsCodeApi()

    const handleMessage = (event: MessageEvent<HostToWebview>) => {
      setLastMessage(event.data)
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  const postMessage = useCallback((msg: WebviewToHost) => {
    const api = apiRef.current ?? getVsCodeApi()
    api.postMessage(msg)
  }, [])

  return { lastMessage, postMessage }
}
