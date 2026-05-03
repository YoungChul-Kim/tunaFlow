import { NavLink } from 'react-router-dom'
import { MessageSquare, ClipboardList } from 'lucide-react'

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
         style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <NavLink
        to="/conversations"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'
          }`
        }
      >
        <MessageSquare className="w-5 h-5" />
        대화
      </NavLink>
      <NavLink
        to="/plans"
        className={({ isActive }) =>
          `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
            isActive ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'
          }`
        }
      >
        <ClipboardList className="w-5 h-5" />
        플랜
      </NavLink>
    </nav>
  )
}
