import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import { MessageBubble } from '@/components/MessageBubble'
import { listMessages, type Message } from '@/lib/api/conversations'
import { sendMessage } from '@/lib/api/agents'
import { wsClient } from '@/lib/api/ws'

export function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const label = (location.state as { label?: string })?.label ?? id

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [sending, setSending]   = useState(false)
  const [thinking, setThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    if (!id) return
    try {
      const msgs = await listMessages(id)
      setMessages(msgs)
    } catch { /* server unreachable */ }
  }, [id])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  useEffect(() => {
    const unsubNew  = wsClient.on('message:new',     () => { loadMessages() })
    const unsubDone = wsClient.on('agent:completed', () => { setSending(false); setThinking(false); loadMessages() })
    const unsubErr  = wsClient.on('agent:error',     () => { setSending(false); setThinking(false); loadMessages() })
    return () => { unsubNew(); unsubDone(); unsubErr() }
  }, [loadMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  async function handleSend() {
    if (!input.trim() || sending || !id) return
    const prompt = input.trim()
    setInput('')
    setSending(true)
    setThinking(true)
    try {
      await sendMessage(id, { prompt })
    } catch {
      setSending(false)
      setThinking(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate('/conversations')} className="p-1 -ml-1 text-zinc-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {label}
          </p>
          {sending && (
            <p className="text-xs text-blue-500">실행 중...</p>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0">
        {messages.map(msg => (
          <MessageBubble key={msg.id} {...msg} />
        ))}
        {thinking && (
          <MessageBubble role="assistant" content="" status="running" engine={null} model={null} />
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 bg-white dark:bg-zinc-950"
           style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="메시지 입력..."
            rows={1}
            disabled={sending}
            className="flex-1 resize-none px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500 max-h-32 overflow-y-auto disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="p-2.5 bg-blue-600 text-white rounded-xl disabled:opacity-40 active:scale-95 transition-transform shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
