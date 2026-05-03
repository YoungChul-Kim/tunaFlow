import { get } from './client'

export interface Conversation {
  id: string
  projectKey: string
  label: string
  mode: string
  type: string
  updatedAt: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  engine: string | null
  model: string | null
  status: string
  timestamp: number
}

export const listConversations = (projectKey?: string) =>
  get<Conversation[]>(`/conversations${projectKey ? `?projectKey=${projectKey}` : ''}`)

export const listMessages = (convId: string) =>
  get<Message[]>(`/conversations/${convId}/messages`)
