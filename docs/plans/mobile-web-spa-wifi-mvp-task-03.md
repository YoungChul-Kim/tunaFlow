# Task 03 — 모바일 SPA 핵심 화면 구현

## Changed files

| 경로 | 상태 |
|------|------|
| `mobile-spa/src/App.tsx` | 수정 (stub → 실제 페이지 import + 라우팅) |
| `mobile-spa/src/pages/ConnectPage.tsx` | 수정 (mock → 실제 API 결선) |
| `mobile-spa/src/pages/ConversationListPage.tsx` | 수정 (mock → 실제 API 결선) |
| `mobile-spa/src/pages/ChatPage.tsx` | 수정 (mock → 실제 API + WS 결선) |
| `mobile-spa/src/pages/PlanStatusPage.tsx` | 수정 (mock → 실제 API + WS 결선) |
| `mobile-spa/src/components/MessageBubble.tsx` | 검증/보완 |
| `mobile-spa/src/components/BottomNav.tsx` | 검증/보완 |
| `mobile-spa/src/components/AgentStatusBadge.tsx` | 신규 |
| `mobile-spa/package.json` | 수정 (react-markdown, remark-gfm 추가) |

## Change description

> 🔄 **인계**: `mobile-spa/src/pages/*`, `components/{BottomNav, MessageBubble}.tsx`, `lib/{mock,time}.ts` 가 mock 기반으로 선행 구현되어 있음. Task 02 완료 후 mock import 를 실제 API 클라이언트(`lib/api/*`) + WS 호출로 교체하는 형태로 진행할 것. 페이지 골격/스타일은 그대로 두고, **데이터 소스만 swap** 하는 것이 기본 방침.

4개 페이지와 공통 컴포넌트를 실제 API에 결선한다. 모든 UI는 48px 최소 tap target, safe-area inset(`pb-[env(safe-area-inset-bottom)]`), 다크 모드 대응 유지.

### 1. 의존성 추가

```bash
cd mobile-spa && npm install react-markdown remark-gfm
```

### 2. ConnectPage.tsx

**동작**:
1. `isConnected()` true → `/conversations` 즉시 redirect.
2. URL 필드(`http://<IP>:19840`), 토큰 필드(password type) 입력.
3. "연결" 버튼 → `GET /api/v1/conversations` 테스트 요청 → 성공 시 `saveConnection()` 후 redirect.
4. 실패 시 에러 메시지(401: 토큰 오류 / network error: 서버 미도달).
5. QR 딥링크 — URL hash `#/connect?url=...&token=...` 자동 입력.

**QR 딥링크 파싱** (`MobileSection.tsx`의 QR payload 형식과 호환):
```typescript
useEffect(() => {
  const hash = window.location.hash
  const params = new URLSearchParams(hash.split('?')[1] ?? '')
  const url   = params.get('url')
  const token = params.get('token')
  if (url && token) { setUrl(url); setToken(token) }
}, [])
```

### 3. ConversationListPage.tsx

1. 마운트 시 `listConversations()` 호출.
2. `updatedAt` 최신순 정렬.
3. 각 항목: 대화 label, mode 배지, 상대 시간(`2시간 전` — 기존 `lib/time.ts` 재사용).
4. 탭 → `/conversations/:id` 이동.
5. BottomNav (대화 / 플랜).
6. WS `message:new` 수신 시 목록 갱신.

### 4. ChatPage.tsx

1. 마운트 시 `listMessages(convId)` 호출, 최하단 스크롤.
2. WS 구독:
   - `message:new` → 메시지 추가, 스크롤 유지.
   - `agent:completed` / `agent:error` → 에이전트 상태 배지 업데이트.
3. 하단 입력창 — textarea(자동 높이) + 전송 버튼.
4. 전송 시 `sendMessage(convId, { prompt })` → 낙관적 UI(user 메시지 즉시 표시).
5. 에이전트 실행 중 입력창 비활성화 + "실행 중…" 배지.
6. 메시지 마크다운 — `react-markdown` + `remark-gfm`.

**스크롤 전략**: `useRef` + `scrollIntoView({ behavior: 'smooth' })`. 사용자가 위로 스크롤 중일 때는 자동 스크롤 스킵.

### 5. PlanStatusPage.tsx

1. 마운트 시 `listPlans(convId)` 호출.
2. `active` 상태 플랜 최상단.
3. 플랜 탭 → `getPlan(planId)` 호출 → 서브태스크 목록.
4. 서브태스크 상태 아이콘: ⬜ pending / 🔄 in_progress / ✅ done / ❌ failed.
5. WS `plan:subtask_status_changed` 수신 시 즉시 업데이트.

> **MVP 범위**: 본 task에서 plan 승인/거절·subtask 상태 변경 버튼은 **추가하지 않는다** (B 범위 액션은 v2.0). read-only로만.

### 6. BottomNav.tsx (선행분 검증)

```tsx
<nav className="fixed bottom-0 left-0 right-0 flex border-t bg-background pb-[env(safe-area-inset-bottom)]">
  <NavTab to="/conversations" icon={<MessageSquare />} label="대화" />
  <NavTab to="/plans"        icon={<ClipboardList />} label="플랜" />
</nav>
```

### 7. MessageBubble.tsx (선행분 검증 + react-markdown 결선)

- `role === 'user'`: 오른쪽 정렬, accent 배경.
- `role === 'assistant'`: 왼쪽 정렬, 엔진/모델 배지, `react-markdown` 렌더링.
- `status === 'running'`: 타이핑 인디케이터(점 3개 애니메이션).

### 8. AgentStatusBadge.tsx (신규)

- `getAgentsStatus()` 결과 기반.
- `running: false` → 표시 안 함.
- `running: true` → 오렌지 점 + "실행 중".

### 9. App.tsx 최종 라우팅

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
      <Route path="/plans"                 element={<PlanStatusPage />} />
      <Route path="*"                      element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
```

## Dependencies

Task 02 완료 후 시작 (API 클라이언트 + WS 레이어 필요). Task 04와는 병렬 가능 (frontend ↔ backend 분리).

## Verification

```bash
# 1. TypeScript 타입 체크 — 0 error
cd mobile-spa && npx tsc --noEmit

# 2. 빌드 성공
cd mobile-spa && npm run build

# 3. mock import 잔존 0건 확인 (실제 API로 swap 완료 검증)
grep -rn "from '../lib/mock'" mobile-spa/src || echo "OK: no mock imports"
grep -rn "from './lib/mock'"  mobile-spa/src || echo "OK: no mock imports"

# 4. Manual: Task 04 완료 후 데스크톱에서 npm run tauri dev 실행 →
#    스마트폰을 같은 WiFi에 붙이고 http://<PC-LAN-IP>:19840/mobile/ 접속:
#    - ConnectPage: URL + 토큰 입력 → 연결 성공
#    - ConversationListPage: 대화 목록 표시
#    - ChatPage: 메시지 전송 → 데스크톱과 폰 양쪽에서 실시간 응답 수신
#    - PlanStatusPage: 플랜 서브태스크 상태 표시 + WS 업데이트
```

## Risks

- `react-markdown`, `remark-gfm` 미설치 상태에서 ChatPage 빌드 시 모듈 미존재 — `npm install` 누락 시 verification 1단계에서 잡힘.
- WS 구독 cleanup 누락 → 메모리 누수. 각 페이지 unmount 시 `wsClient.on()` 반환 unsubscribe 호출 필수.
- iOS Safari `env(safe-area-inset-bottom)` 미지원 시 하단 탭이 홈 인디케이터에 겹침. `@supports` fallback 권장.
- 낙관적 UI 메시지가 서버 응답으로 dedup 되지 않으면 중복 표시. `id` 기준 Set / Map 으로 dedup.
- mock 페이지의 시그니처가 Task 02 export 와 미세하게 다를 수 있음 — 그 경우 페이지 측 호출부를 Task 02 시그니처에 맞춰 조정.

## Scope boundary (수정 금지)

- `mobile-spa/src/lib/api/**` — Task 02 영역 (수정 시 두 task 산출물 충돌)
- `mobile-spa/src/lib/connect.ts` — Task 02 영역
- `mobile-spa/vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/index.css` — Task 01 영역
- `src-tauri/**` — Task 04 영역
- 루트 `src/**` (desktop 프로젝트 무수정)
- `mobile-spa/src/lib/mock.ts` — 페이지가 더 이상 import 하지 않게 되더라도 본 task에서는 **삭제 금지** (사용자가 v2.0 검토 시 비교 자료로 활용 가능). 삭제는 별도 PR.

## Parallel Group

C (Task 02 완료 후 시작)
