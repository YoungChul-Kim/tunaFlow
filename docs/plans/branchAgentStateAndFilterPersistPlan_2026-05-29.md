---
title: branch/RT 전환 시 agent 활성화 유지 + workflow filter 유지 — 외부 사용자 보고 2건
status: ready
priority: P1 (외부 사용자 가시 UX 회귀)
created_at: 2026-05-29
---

# 0. Context

다모앙 커뮤니티 사용자 (Plan/Dev mismatch 보고자와 동일) 의 추가 보고 2건:

1. **branch/RT 전환 시 agent 활성화 값 초기화** — branch 나 roundtable 을 왔다갔다 하면 선택된 engine/model/persona 가 default 로 reset. 유지 원함.
2. **workflow filter all→check reset** — workflow "all" 필터에서 plan 의 done/draft 버튼 누르면 필터가 "plan-check" 으로 돌아감. 필터 유지 원함.

# 진단 (Architect 사전 분석, Explore 진단 확정)

## 이슈 1 — branch shadow conv 의 engine 상속 부재

- branch shadow conversation 의 id = `branch:<branchId>` 형식
- `branchSlice.openBranchStream` (`src/stores/slices/branchSlice.ts:160-183`) 가 `selectedConversationId` 를 `branchConvId` 로 변경
- `NewMessageInput` restoration useEffect (`NewMessageInput.tsx:84-107`) 가 `getConversationEngine(branchConvId)` 조회 → `_convEngineMap` 에 `branch:xyz` 키 없음 → **null** → "첫 방문" 으로 인식 → **default profile (profiles[0]) 강제 적용** → engine/model/persona reset
- root cause: branch 진입 시 부모 conv 의 engine 을 shadow conv 키로 상속하는 로직 부재

## 이슈 2 — filter 강제 reset

- workflow filter state = `CenterPanel.tsx:40` 의 `activeStage` local state (`"all" | "plan-check" | "dev" | "review" | "done"`)
- `CenterPanel.tsx:268-271` 의 `onStatusChanged` 콜백이 status 변경 시 **항상 `setActiveStage("plan-check")`** 호출 → 필터 강제 리셋
- root cause: status 변경 후 필터를 plan-check 으로 되돌릴 이유 없음 (HarnessSummary refresh 만 필요)

# 1. Invariants

- **INV-BAF-1**: branch/RT shadow conv 진입 시 부모 conv 의 engine/model/persona 가 유지됨 (default profile 강제 적용 X)
- **INV-BAF-2**: 부모 conv 가 engine 미설정 (첫 방문) 이면 기존 default 동작 보존 (회귀 0)
- **INV-BAF-3**: workflow filter 가 plan status 변경 (done/draft 등) 후에도 유지됨
- **INV-BAF-4**: plan **phase** 변경 시의 자동 stage 전환 (`PHASE_TO_STAGE` 매핑, `CenterPanel.tsx:264-266`) 은 보존 — 이건 의도된 동작 (drafting→plan-check 등)
- **INV-BAF-5**: 두 fix 모두 다른 conv/branch 전환 동작 회귀 0

# 2. Goals / Non-goals

## Goals
- branch/RT 진입 시 부모 conv engine 상속 (shadow conv 키에 저장)
- workflow filter status 변경 시 유지

## Non-goals
- RT config (participants/mode) 의 shadow conv 상속 — 별 이슈 (DB rt_config 영역, 본 plan 비대상). 단 engine 상속만으로 사용자 보고 1차 해결
- phase 변경 시 자동 stage 전환 로직 변경 (의도된 동작 보존)
- `_convEngineMap` persistence 구조 변경

# 3. Subtasks

## T1 — branch shadow conv engine 상속 (P1)

**파일**: `src/stores/slices/branchSlice.ts` (`openBranchStream`, line 160-183)

부모 conv 의 engine 을 shadow conv 키로 상속:
```ts
// openBranchStream 내 set({...}) 전후
const parentConvId = get().selectedConversationId;
const parentEngine = get().getConversationEngine(parentConvId);
// ... 기존 set({ selectedConversationId: branchConvId, ... })
if (parentEngine) {
  get().saveConversationEngine(branchConvId, parentEngine);
}
```

**주의**: `saveConversationEngine` 호출이 set 이후 (selectedConversationId 변경 후) 이어야 NewMessageInput restore effect 가 상속된 값을 읽음. set 순서 + effect 타이밍 확인.

**대안 (더 견고)**: `getConversationEngine` 의 wrapper 에서 `branch:` prefix 면 부모 conv 로 fallback lookup — 단 이 경우 parent conv id 를 shadow conv 에서 역산해야 해서 복잡. T1 의 상속 저장 방식 우선.

## T2 — RT/branch 재진입 시에도 상속 보존 (P1)

**파일**: 동일 또는 thread/RT 진입 경로

branch 를 여러 번 왔다갔다 할 때 (재진입) 두 번째 진입부터는 `branch:xyz` 키에 이미 값이 있으면 (이전에 저장됨) 그대로 사용. 첫 진입만 상속. T1 의 `saveConversationEngine` 가 이미 있으면 덮어쓰지 않도록 조건:
```ts
if (parentEngine && !get().getConversationEngine(branchConvId)) {
  get().saveConversationEngine(branchConvId, parentEngine);
}
```
사용자가 branch 안에서 명시적으로 engine 바꾼 경우 보존 (재진입 시 reset 안 함).

## T3 — workflow filter 유지 (P1)

**파일**: `src/components/tunaflow/CenterPanel.tsx:268-271`

```diff
   onStatusChanged={() => {
     setPlanRefreshKey((k) => k + 1);
-    setActiveStage("plan-check");
   }}
```

phase 변경 시 자동 전환 (`onPhaseChanged` → `PHASE_TO_STAGE`) 은 그대로 보존. status 변경 시에만 필터 유지.

## T4 — 검증 + test (P1)

- T1/T2: branch 진입 → engine 상속 + 재진입 시 보존 unit test (Zustand store mock)
- T3: filter state 유지 — `onStatusChanged` 콜백이 activeStage 안 건드림 확인 (component test 또는 콜백 단위)

# 4. Cross-cutting risks

- **T1 의 set 순서 + effect 타이밍**: `saveConversationEngine` 가 set (selectedConversationId 변경) 이후여야 NewMessageInput 의 restore effect 가 상속값을 봄. 같은 tick 안 race 가능 — effect 가 `_convEngineMap` 최신값 읽는지 확인
- **재진입 보존 (T2)**: 사용자가 branch 안에서 engine 바꾼 후 나갔다 다시 들어올 때 그 값 유지 — `!getConversationEngine(branchConvId)` 조건으로 첫 진입만 상속
- **RT 의 engine vs participants**: 본 plan 은 engine 상속만. RT participants/mode 는 별 이슈 (DB rt_config). 사용자 보고의 "agent 활성화" 가 engine selector 면 T1 으로 해결, RT participants 면 별 plan 필요 — 1차 engine 상속으로 보고 영역 cover 후 재확인
- **T3 의 phase 자동 전환 보존**: `onPhaseChanged` 와 `onStatusChanged` 가 별 콜백이라 T3 의 status 변경 fix 가 phase 전환 영향 0

# 5. Rollback

T1~T4 별 commit 분리. 각 revert 가능. frontend 한정.

# 6. 다음 step

1. Developer 핸드오프 작성 — `docs/prompts/branchAgentStateAndFilterPersistDeveloperHandoff_2026-05-29.md`
2. Developer subagent dispatch (worktree 격리, admin merge — frontend 한정)
3. 머지 후 release timing — v0.1.9-beta-3 또는 다음 묶음
