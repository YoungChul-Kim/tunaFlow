import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wifi, Eye, EyeOff } from 'lucide-react'
import { saveConnection, clearConnection, isConnected } from '@/lib/connect'
import { wsClient } from '@/lib/api/ws'
import { listConversations } from '@/lib/api/conversations'

export function ConnectPage() {
  const navigate = useNavigate()
  const [url, setUrl]         = useState(window.location.origin)
  const [token, setToken]     = useState('')
  const [showToken, setShowToken] = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isConnected()) navigate('/conversations', { replace: true })
  }, [navigate])

  useEffect(() => {
    const hash = window.location.hash
    const qs = hash.includes('?') ? hash.split('?')[1] : ''
    const params = new URLSearchParams(qs)
    const u = params.get('url')
    const t = params.get('token')
    if (u) setUrl(u)
    if (t) setToken(t)
  }, [])

  async function handleConnect() {
    if (!url.trim() || !token.trim()) {
      setError('URL과 토큰을 모두 입력하세요')
      return
    }
    setLoading(true)
    setError('')
    try {
      saveConnection(url, token)
      await listConversations()
      wsClient.connect()
      navigate('/conversations')
    } catch (e: unknown) {
      clearConnection()
      const status = (e as { status?: number }).status
      setError(status === 401 ? '토큰이 올바르지 않습니다' : '서버에 연결할 수 없습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <Wifi className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">tunaFlow</h1>
            <p className="text-xs text-zinc-500">원격 연결</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
              서버 URL
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="http://192.168.x.x:19841"
              className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
              API 토큰
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Settings → Mobile에서 복사"
                className="w-full px-3 py-2.5 pr-10 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowToken(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
          >
            {loading ? '연결 중...' : '연결'}
          </button>

          <p className="text-center text-xs text-zinc-400">
            PC의 Settings → Mobile에서 QR 코드를 스캔하세요
          </p>
        </div>
      </div>
    </div>
  )
}
