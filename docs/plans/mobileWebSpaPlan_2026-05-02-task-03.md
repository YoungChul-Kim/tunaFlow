# Task 03 — 모바일 SPA 핵심 화면 구현

## Changed files

| 경로 | 상태 |
|------|------|
| `mobile-spa/src/App.tsx` | 수정 (stub → 실제 페이지 import) |
| `mobile-spa/src/pages/ConnectPage.tsx` | 신규 |
| `mobile-spa/src/pages/ConversationListPage.tsx` | 신규 |
| `mobile-spa/src/pages/ChatPage.tsx` | 신규 |
| `mobile-spa/src/pages/PlanStatusPage.tsx` | 신규 |
| `mobile-spa/src/components/MessageBubble.tsx` | 신규 |
| `mobile-spa/src/components/AgentStatusBadge.tsx` | 신규 |
| `mobile-spa/src/components/BottomNav.tsx` | 신규 |

## Change description

> 🔄 **인계**: `mobile-spa/src/pages/*` 와 `components/{BottomNav,MessageBubble}.tsx`, `lib/mock.ts` 가 mock 기반으로 선행 구현되어 있음 — Task 02 완료 후 mock import 를 실제 API 클라이언트(`lib/api/*`) + WS 호출로 교체하는 형태로 진행할 것.

4개 페이지와 공통 컴포넌트를 구현한다. 모든 UI는 48px 최소 tap target, safe-area inset(`pb-safe`), 다크 모드 대응을 기준으로 작성한다.

---

### ConnectPage.tsx

사용자가 처음 접속 시 서버 URL과 토큰을 입력하는 화면.

**동작**:
1. `isConnected()`가 true이면 `/conversations`로 즉시 redirect.
2. URL 필드(`http://<IP>:19840`), 토큰 필드(password type) 입력.
3. "연결" 버튼 → `GET /api/v1/conversations` 테스트 요청 → 성공 시 `saveConnection()` 후 redirect.
4. 실패 시 에러 메시지 표시 (401: 토큰 오류 / network error: 서버 미도달).
5. QR 코드 스캔 딥링크 지원: URL hash `#/connect?url=...&token=...` 파싱 후 자동 입력.

**QR 딥링크 파싱** (`MobileSection.tsx`의 QR payload 형식 `{ url, token }` JSON):
```typescript
useEffect(() => {
  const hash = window.location.hash  // "#/connect?url=...&token=..."
  const params = new URLSearchParams(hash.split('?')[1])
  const url   = params.get('url')
  const token = params.get('token')
  if (url && token) { setUrl(url); setToken(token) }
}, [])
```

---

### ConversationListPage.tsx

대화 목록을 보여주는 화면.

**동작**:
1. 마운트 시 `listConversations()` 호출.
2. `updatedAt` 최신순 정렬.
3. 각 항목: 대화 label, mode 배지, 상대 시간(`2시간 전` 등).
4. 탭 → `/conversations/:id` 이동.
5. 하단 BottomNav (대화 목록 / 플랜 탭).
6. WebSocket `message:new` 이벤트 수신 시 목록 갱신 (새 메시지 있는 대화를 상단으로).

---

### ChatPage.tsx

특정 대화의 메시지 목록과 전송 UI.

**동작**:
1. 마운트 시 `listMessages(convId)` 호출, 최하단 스크롤.
2. WebSocket 이벤트 구독:
   - `message:new` → 메시지 목록에 추가, 스크롤 유지.
   - `agent:completed` / `agent:error` → 에이전트 상태 배지 업데이트.
3. 하단 입력창: textarea(자동 높이 조정) + 전송 버튼.
4. 전송 시 `sendMessage(convId, { prompt })` 호출 → 낙관적 UI(user 메시지 즉시 표시).
5. 에이전트 실행 중일 때 입력창 비활성화 + "실행 중..." 배지 표시.
6. 메시지 내용 마크다운 렌더링 (코드 블록 포함) — `react-markdown` + `remark-gfm` (Task 01 의존성에 추가).

**스크롤 전략**: `useRef` + `scrollIntoView({ behavior: 'smooth' })`, 새 메시지 도착 시 자동 스크롤 (단, 사용자가 위로 스크롤 중일 때는 스킵).

---

### PlanStatusPage.tsx

현재 대화의 플랜 목록과 서브태스크 상태.

**동작**:
1. 마운트 시 `listPlans(convId)` 호출.
2. `active` 상태 플랜 최상단 표시.
3. 플랜 탭 → `getPlan(planId)` 호출 → 서브태스크 목록 표시.
4. 서브태스크 상태 아이콘: ⬜ pending / 🔄 in_progress / ✅ done / ❌ failed.
5. WebSocket `plan:subtask_status_changed` 이벤트 수신 시 즉시 업데이트.

---

### BottomNav.tsx

하단 고정 탭 바. 대화 목록 / 플랜 두 탭.

```tsx
<nav className="fixed bottom-0 left-0 right-0 flex border-t bg-background pb-[env(safe-area-inset-bottom)]">
  <NavTab to="/conversations" icon={<MessageSquare />} label="대화" />
  <NavTab to="/plans"        icon={<ClipboardList />} label="플랜" />
</nav>
```

---

### MessageBubble.tsx

단일 메시지 카드.

- `role === 'user'`: 오른쪽 정렬, accent 배경.
- `role === 'assistant'`: 왼쪽 정렬, 엔진/모델 배지, `react-markdown` 렌더링.
- `status === 'running'`: 타이핑 인디케이터(점 3개 애니메이션).

---

### AgentStatusBadge.tsx

`GET /api/v1/agents/status` 결과 기반 배지.

- `running: false`: 표시 안 함.
- `running: true`: 오렌지 점 + "실행 중" 텍스트.

---

### App.tsx 최종 라우팅

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { ConnectPage }          from './pages/ConnectPage'
import { ConversationListPage } from './pages/ConversationListPage'
import { ChatPage }             from './pages/ChatPage'
import { PlanStatusPage }       from './pages/PlanStatusPage'

export default function App() {
  return (
    <Routes>
      <Route path="/connect"               element={<ConnectPage />} />
      <Route path="/conversations"         element={<ConversationListPage />} />
      <Route path="/conversations/:id"     element={<ChatPage />} />
      <Route path="/conversations/:id/plans" element={<PlanStatusPage />} />
      <Route path="*"                      element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
```

## Dependencies

Task 02 완료 후 시작 (API 클라이언트 레이어 필요).

Task 01 의존성에 `react-markdown`, `remark-gfm` 추가 필요:
```bash
cd mobile-spa && npm install react-markdown remark-gfm
```

## Verification

```bash
# 1. 빌드 성공 확인
cd mobile-spa && npm run build

# 2. 타입 체크 에러 0개
cd mobile-spa && npx tsc --noEmit

# 3. Manual: Task 04 완료 후 스마트폰 브라우저에서 http://<LAN-IP>:19840/mobile/ 접속
#    - ConnectPage: URL + 토큰 입력 → 연결 성공
#    - ConversationListPage: 대화 목록 표시
#    - ChatPage: 메시지 전송 → 실시간 응답 수신
#    - PlanStatusPage: 플랜 서브태스크 상태 표시
```

## Risks

- `react-markdown`은 Task 01 `package.json`에 없음 — 이 태스크에서 `npm install react-markdown remark-gfm` 추가 필요.
- WebSocket 구독 해제를 `useEffect` cleanup에서 빠뜨리면 메모리 누수. 각 페이지 unmount 시 `wsClient.on()` 반환 unsubscribe 함수 호출 필수.
- iOS Safari에서 `env(safe-area-inset-bottom)` 미지원 시 하단 탭이 홈 인디케이터에 겹침 — `@supports` fallback 추가 권장.

## Parallel Group

C (Task 02 완료 후 시작)
