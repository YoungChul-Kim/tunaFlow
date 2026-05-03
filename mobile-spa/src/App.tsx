import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConnectPage }           from './pages/ConnectPage'
import { ConversationListPage }  from './pages/ConversationListPage'
import { ChatPage }              from './pages/ChatPage'
import { PlanStatusPage }        from './pages/PlanStatusPage'
import { isConnected }           from '@/lib/connect'
import { wsClient }              from '@/lib/api/ws'

export default function App() {
  useEffect(() => {
    if (isConnected()) wsClient.connect()
  }, [])

  return (
    <Routes>
      <Route path="/connect"                 element={<ConnectPage />} />
      <Route path="/conversations"           element={<ConversationListPage />} />
      <Route path="/conversations/:id"       element={<ChatPage />} />
      <Route path="/conversations/:id/plans" element={<PlanStatusPage />} />
      <Route path="/plans"                   element={<PlanStatusPage />} />
      <Route path="*"                        element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
