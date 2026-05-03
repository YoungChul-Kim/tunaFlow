import { useState, useEffect } from 'react'
import { getAgentsStatus } from '@/lib/api/agents'

export function AgentStatusBadge() {
  const [running, setRunning] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const { running: r } = await getAgentsStatus()
        if (!cancelled) setRunning(r)
      } catch { /* ignore */ }
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  if (!running) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-orange-500 font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
      실행 중
    </span>
  )
}
