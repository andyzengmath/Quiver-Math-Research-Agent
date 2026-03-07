import type { WebviewToHost } from './protocol'
import type { MathResearchPanel } from './panel'

export type MessageHandler = (msg: WebviewToHost, panel: MathResearchPanel) => Promise<void>

export class MessageHandlerRegistry {
  private readonly handlers: Map<string, MessageHandler> = new Map()

  register(type: string, handler: MessageHandler): void {
    this.handlers.set(type, handler)
  }

  async handle(msg: WebviewToHost, panel: MathResearchPanel): Promise<void> {
    const handler = this.handlers.get(msg.type)
    if (handler) {
      await handler(msg, panel)
    } else {
      console.warn(`[MathResearchPanel] No handler registered for message type: ${msg.type}`)
    }
  }
}
