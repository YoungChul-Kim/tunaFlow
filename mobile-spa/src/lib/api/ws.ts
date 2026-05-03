import { getConnection } from '../connect'

export type WsEvent = { type: string; payload: unknown }

export class TunaWsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<(payload: unknown) => void>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sinceMs = 0

  connect() {
    const { url, token } = getConnection()
    const wsUrl = url.replace(/^http/, 'ws')
    const qs = this.sinceMs > 0 ? `?since=${this.sinceMs}&token=${token}` : `?token=${token}`
    this.ws = new WebSocket(`${wsUrl}/ws/events${qs}`)
    this.ws.onmessage = (e) => {
      const ev: WsEvent = JSON.parse(e.data)
      this.sinceMs = Date.now()
      this.handlers.get(ev.type)?.forEach(fn => fn(ev.payload))
      this.handlers.get('*')?.forEach(fn => fn(ev))
    }
    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    }
  }

  on(type: string, fn: (payload: unknown) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn)
    return () => this.handlers.get(type)?.delete(fn)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new TunaWsClient()
