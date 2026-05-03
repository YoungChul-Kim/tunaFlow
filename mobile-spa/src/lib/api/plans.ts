import { get } from './client'

export interface Plan {
  id: string
  conversationId: string
  title: string
  status: string
  phase: string
  updatedAt: number
}

export interface PlanSubtask {
  id: string
  planId: string
  idx: number
  title: string
  status: string
}

export const listPlans = (conversationId?: string) =>
  get<Plan[]>(`/plans${conversationId ? `?conversationId=${conversationId}` : ''}`)

export const getPlan = (planId: string) =>
  get<Plan & { subtasks: PlanSubtask[] }>(`/plans/${planId}?include=subtasks`)
