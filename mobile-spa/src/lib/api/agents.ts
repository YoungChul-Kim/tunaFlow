import { get, post } from './client'

export interface SendMessageInput {
  prompt: string
  engine?: string
  model?: string
}

export const sendMessage = (convId: string, input: SendMessageInput) =>
  post(`/conversations/${convId}/send`, input)

export const getAgentsStatus = () =>
  get<{ running: boolean; jobs: unknown[] }>('/agents/status')
