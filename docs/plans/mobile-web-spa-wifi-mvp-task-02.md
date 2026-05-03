# Task 02 — HTTP API 클라이언트 + WS 레이어

## Changed files

| 경로 | 상태 |
|------|------|
| `mobile-spa/src/lib/connect.ts` | 신규 |
| `mobile-spa/src/lib/api/client.ts` | 신규 |
| `mobile-spa/src/lib/api/ws.ts` | 신규 |
| `mobile-spa/src/lib/api/conversations.ts` | 신규 |
| `mobile-spa/src/lib/api/agents.ts` | 신규 |
| `mobile-spa/src/lib/api/plans.ts` | 신규 |

## Change description

Tauri `invoke` 없이 HTTP API를 호출하는 클라이언트 레이어를 작성한다. 모든 모듈은 `src/lib/connect.ts`에서 URL과 토큰을 읽어 인증 헤더를 붙인다. 본 task는 Task 03이 mock import를 실제 API로 교체할 수 있도록 모든 export 시그니처를 mock 측 시그니처와 호환되게 한다 — 충돌 발생 시 mock 측이 임시 alias 한 줄로 흡수 가능하도록 단순한 함수 export 형태 유지.

### 1. connect.ts — 연결 설정 저장소

```typescript
const STORAGE_URL   = 'tf_mobile_url'
const STORAGE_TOKEN = 'tf_mobile_token'

export function getConnection() {
  return {
    url:   localStorage.getItem(STORAGE_URL)   ?? '',
    token: localStorage.getItem(STORAGE_TOKEN) ?? '',
  }
}

export function saveConnection(url: string, token: string) {
  localStorage.setItem(STORAGE_URL,   url.replace(/\/$/, ''))
  localStorage.setItem(STORAGE_TOKEN, token)
}

export function clearConnection() {
  localStorage.removeItem(STORAGE_URL)
  localStorage.removeItem(STORAGE_TOKEN)
}

export function isConnected(): boolean {
  const { url, token } = getConnection()
  return url.length > 0 && token.length >= 32
}
```

### 2. api/client.ts — fetch 래퍼

```typescript
import { getConnection } from '../connect'

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = getConnection()
  const res = await fetch(`${url}/api/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...init.headers,
    },
  })
  if (!res.ok) throw new ApiError(res.status, await res.text())
  return res.json() as Promise<T>
}

export const get  = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined })
```

### 3. api/ws.ts — 재연결 가능한 WebSocket

```typescript
import { getConnection } from '../connect'

export type WsEvent = { type: string; payload: unknown }

export class TunaWsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<(payload: unknown) => void>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sinceMs = 0

  connect() {
    const { url, token } = getConnection()
    const wsUrl = url.replace(/^http/, 'ws')
    const qs = this.sinceMs > 0 ? `?since=${this.sinceMs}&token=${token}` : `?token=${token}`
    this.ws = new WebSocket(`${wsUrl}/ws/events${qs}`)
    this.ws.onmessage = (e) => {
      const ev: WsEvent = JSON.parse(e.data)
      this.sinceMs = Date.now()
      this.handlers.get(ev.type)?.forEach(fn => fn(ev.payload))
      this.handlers.get('*')?.forEach(fn => fn(ev))
    }
    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 2000)
    }
  }

  on(type: string, fn: (payload: unknown) => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set())
    this.handlers.get(type)!.add(fn)
    return () => this.handlers.get(type)?.delete(fn)
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new TunaWsClient()
```

자동 재연결 2초 대기, `?since=` 파라미터로 재연결 시 놓친 이벤트 재생.

### 4. api/conversations.ts

```typescript
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
```

### 5. api/agents.ts

```typescript
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
```

### 6. api/plans.ts

```typescript
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
  seq: number
  title: string
  status: string
}

export const listPlans = (conversationId?: string) =>
  get<Plan[]>(`/plans${conversationId ? `?conversationId=${conversationId}` : ''}`)

export const getPlan = (planId: string) =>
  get<Plan & { subtasks: PlanSubtask[] }>(`/plans/${planId}?include=subtasks`)
```

## Dependencies

Task 01 완료 후 시작 (`mobile-spa/` 프로젝트 구조 + tsconfig + 의존성 필요).

## Verification

```bash
# 1. TypeScript 타입 체크 — 0 error
cd mobile-spa && npx tsc --noEmit

# 2. 빌드 성공
cd mobile-spa && npm run build

# 3. 모듈 export 존재 확인 (smoke check)
node -e "import('./mobile-spa/src/lib/connect.ts').catch(()=>{}); console.log('module path resolved')"
# 또는 (확실한 방식) — Task 03이 import할 export 이름이 모두 정의되어 있는지 ts-node 없이도 grep으로 확인:
grep -E "^export " mobile-spa/src/lib/connect.ts mobile-spa/src/lib/api/*.ts
```

## Risks

- `?token=` 쿼리 파라미터로 WebSocket 인증 — URL 로그에 토큰 노출 가능. LAN 환경에서는 허용 가능한 수준이며, Tailscale 등 암호화 터널 사용 시 무관.
- `ApiError` 클래스가 `instanceof` 체크에 의존 — 번들러에 따라 prototype chain 문제 발생 가능. `err.status` 체크로 대체 가능하도록 status를 public 필드로 노출.
- 기존 mock 페이지가 `lib/mock.ts`의 함수 시그니처에 의존 — Task 03이 swap 시 시그니처 불일치가 드러나면 본 task 산출물에 호환 alias 한 줄 추가하거나 Task 03에서 흡수.
- WS 재연결 시 `sinceMs = Date.now()`는 클라이언트 시계 — 서버와 시계가 어긋나면 재생 누락/중복 가능. MVP 범위에서는 허용.

## Scope boundary (수정 금지)

- `mobile-spa/src/lib/mock.ts`, `mobile-spa/src/lib/time.ts` — Task 03(혹은 선행 mock) 영역
- `mobile-spa/src/pages/**` — Task 03 영역
- `mobile-spa/src/components/**` — Task 03 영역
- `mobile-spa/src/main.tsx`, `App.tsx`, `index.css` — Task 01 영역
- `src-tauri/**` — Task 04 영역
- 루트 `src/**` (desktop 프로젝트 무수정)

## Parallel Group

B (Task 01 완료 후, Task 04와 병렬 실행 가능)
