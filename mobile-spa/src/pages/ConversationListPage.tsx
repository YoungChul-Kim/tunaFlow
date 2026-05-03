import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, ChevronRight } from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import { listConversations, type Conversation } from '@/lib/api/conversations'
import { wsClient } from '@/lib/api/ws'
import { relativeTime } from '@/lib/time'

export function ConversationListPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [error, setError] = useState('')

  async function load() {
    try {
      const data = await listConversations()
      setConversations([...data].sort((a, b) => b.updatedAt - a.updatedAt))
    } catch {
      setError('대화 목록을 불러오지 못했습니다')
    }
  }

  useEffect(() => {
    load()
    const unsub = wsClient.on('message:new', () => load())
    return () => { unsub() }
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      <header className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">대화</h1>
        <p className="text-xs text-zinc-400">tunaFlow</p>
      </header>

      {error && <p className="px-4 py-3 text-xs text-red-500">{error}</p>}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {conversations.map(conv => (
          <button
            key={conv.id}
            onClick={() => navigate(`/conversations/${conv.id}`, { state: { label: conv.label } })}
            className="w-full flex items-center gap-3 px-4 py-4 bg-white dark:bg-zinc-950 active:bg-zinc-50 dark:active:bg-zinc-900 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {conv.label}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">{relativeTime(conv.updatedAt)}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0" />
          </button>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
