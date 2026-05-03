import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import { listPlans, getPlan, type Plan, type PlanSubtask } from '@/lib/api/plans'
import { wsClient } from '@/lib/api/ws'

const statusIcon = {
  done:        <CheckCircle2 className="w-4 h-4 text-green-500" />,
  in_progress: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  pending:     <Circle className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />,
  failed:      <XCircle className="w-4 h-4 text-red-500" />,
} as const

interface PlanWithSubtasks extends Plan {
  subtasks: PlanSubtask[]
}

export function PlanStatusPage() {
  const { id: convId } = useParams<{ id?: string }>()
  const [plans, setPlans]       = useState<PlanWithSubtasks[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  async function loadPlans() {
    try {
      const list = await listPlans(convId)
      const active = list.filter(p => p.status === 'active' || p.status === 'approved')
      const detail = await Promise.all(active.map(p => getPlan(p.id)))
      setPlans(detail)
      if (detail.length > 0) setExpanded(prev => prev ?? detail[0].id)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadPlans()
    const unsub = wsClient.on('plan:subtask_status_changed', () => loadPlans())
    return () => { unsub() }
  }, [])

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20">
      <header className="sticky top-0 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 px-4 py-3"
              style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">플랜</h1>
      </header>

      <div className="px-4 py-4 space-y-3">
        {plans.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-8">진행 중인 플랜이 없습니다</p>
        )}
        {plans.map(plan => (
          <div key={plan.id} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button
              onClick={() => setExpanded(v => v === plan.id ? null : plan.id)}
              className="w-full flex items-center gap-3 px-4 py-4 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                    {plan.status}
                  </span>
                  <span className="text-xs text-zinc-400">{plan.phase}</span>
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
                  {plan.title}
                </p>
              </div>
              {expanded === plan.id
                ? <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
              }
            </button>

            {expanded === plan.id && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
                {plan.subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-3 px-4 py-3">
                    {statusIcon[st.status as keyof typeof statusIcon] ?? statusIcon.pending}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-800 dark:text-zinc-200">
                        <span className="text-xs text-zinc-400 mr-2">Task {String(st.idx).padStart(2, '0')}</span>
                        {st.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
