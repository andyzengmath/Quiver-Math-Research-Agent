import { MessageHandlerRegistry } from '../message-handler'
import { WebviewToHost } from '../protocol'
import type { MathResearchPanel } from '../panel'

export function registerModelHandler(registry: MessageHandlerRegistry): void {
  registry.register('setModel', async (msg: WebviewToHost, panel: MathResearchPanel) => {
    if (msg.type !== 'setModel') {
      return
    }

    const { llm } = panel.services

    try {
      llm.setProvider(msg.provider)
    } catch {
      // setProvider failed silently
    }
  })
}
