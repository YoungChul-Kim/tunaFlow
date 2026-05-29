---
title: Developer 핸드오프 — branch agent 상태 유지 + workflow filter 유지
plan: docs/plans/branchAgentStateAndFilterPersistPlan_2026-05-29.md
created_at: 2026-05-29
---

# 0. 한 줄 요약

다모앙 사용자 보고 2건: (1) branch/RT 전환 시 agent 활성화 (engine/model/persona) 초기화 — shadow conv engine 상속 부재. (2) workflow filter 가 plan status 변경 후 "plan-check" 으로 강제 리셋. frontend 한정 4 task.

# 1. SSOT
- **Plan**: `docs/plans/branchAgentStateAndFilterPersistPlan_2026-05-29.md` (§3 T1~T4)
- Explore 진단 확정 — 두 root cause 모두 파일:라인 명시됨

# 2. PR 전략 — 단일 PR

브랜치: `fix/branch-agent-state-and-filter-persist`

4 commit:
- `fix(branch): inherit parent conv engine into shadow conv (T1)`
- `fix(branch): preserve user-changed engine on branch re-entry (T2)`
- `fix(workflow): keep filter stage on plan status change (T3)`
- `test(branch,workflow): engine inheritance + filter persistence coverage (T4)`

각 trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

# 3. 작업 순서

T1 → T2 (같은 파일 branchSlice, T1 의 상속 로직에 조건 추가가 T2) → T3 (별 파일 CenterPanel) → T4 (test)

# 4. DO

1. **T1** — `branchSlice.ts:openBranchStream` 에서 부모 conv engine 을 shadow conv 키로 상속. `saveConversationEngine(branchConvId, parentEngine)` 가 set (selectedConversationId 변경) **이후** 호출되어 NewMessageInput restore effect 가 상속값을 읽도록
2. **T2** — `!get().getConversationEngine(branchConvId)` 조건 — **첫 진입만 상속**, 재진입 시 사용자가 branch 안에서 바꾼 engine 보존
3. **T1/T2 부모 engine null 케이스** — 부모도 미설정이면 상속 안 함 (기존 default 동작 보존, INV-BAF-2)
4. **T3** — `CenterPanel.tsx:270` 의 `setActiveStage("plan-check")` 만 제거. `setPlanRefreshKey` 는 유지. `onPhaseChanged` 의 `PHASE_TO_STAGE` 자동 전환은 절대 변경 X (의도된 동작, INV-BAF-4)
5. **T4** — Zustand store mock 으로 engine 상속 + 재진입 보존 + filter 유지 unit test

# 5. DO NOT

- ❌ `onPhaseChanged` / `PHASE_TO_STAGE` 매핑 (`CenterPanel.tsx:264-266`) 변경 — phase 변경 시 자동 stage 전환은 의도된 동작
- ❌ `_convEngineMap` persistence 구조 / `saveConversationEngine` / `getConversationEngine` 시그니처 변경
- ❌ RT config (participants/mode) DB rt_config 영역 변경 — 별 이슈, 본 PR 비대상 (engine 상속만)
- ❌ NewMessageInput 의 restore effect 로직 자체 변경 — branchSlice 에서 상속값 미리 저장하는 방식으로 해결
- ❌ Rust 영역 변경 (frontend 한정)
- ❌ 다른 conv 전환 동작 (main↔main, 일반 conv select) 변경
- ❌ 새 dependency
- ❌ release version bump / CHANGELOG / tag (Architect 영역)

# 6. Verification

```bash
cd src-tauri && cargo check --message-format=short    # 변경 0
npx tsc --noEmit
npx vitest run                                         # baseline 491 + T4 +N
```

회귀 grep:
```bash
git diff src-tauri/                                                  # 변경 0
git diff src/components/tunaflow/CenterPanel.tsx | grep -E "PHASE_TO_STAGE|onPhaseChanged"  # 0 (phase 로직 보존)
git diff src/components/tunaflow/NewMessageInput.tsx                 # 변경 0 (restore effect 보존)
rg "saveConversationEngine.*branchConvId|getConversationEngine.*branchConvId" src/stores/slices/branchSlice.ts  # T1/T2 상속 로직 확인
rg "setActiveStage\(\"plan-check\"\)" src/components/tunaflow/CenterPanel.tsx  # onStatusChanged 영역 0, onPhaseChanged 의 PHASE_TO_STAGE 만 잔존
```

# 7. e2e 수동 검증 (사용자 영역)

- main chat 에서 codex 선택 → branch 진입 → engine 이 codex 유지 (claude default 로 reset 안 됨)
- branch 안에서 engine 을 gemini 로 변경 → 나갔다 재진입 → gemini 유지 (상속으로 덮어쓰기 안 됨)
- RT 진입 → engine 유지
- workflow "all" 필터 → plan done/draft 버튼 클릭 → 필터 "all" 유지 (plan-check 으로 안 돌아감)
- plan phase 변경 (drafting→approval 등) → 자동 stage 전환은 그대로 동작

GUI 환경 제약 시 vitest mock 으로 대체.

# 8. CI 정책

PR 직후 `gh pr merge --squash --delete-branch --admin` 즉시 머지. CI watch 불필요 (frontend 한정, cross-platform 회귀 위험 0).

# 9. 보고 포맷 (chat)

```
## Branch Agent State + Filter Persist 결과
- PR URL + 머지 commit
- task 별 변경 라인 + 핵심 파일
- §6 Verification: cargo check / tsc / vitest 신규 +N
- §7 e2e — 자동 / 사용자 영역
- 회귀 가드 grep (PHASE_TO_STAGE 보존 / NewMessageInput 보존 / Rust 0)
- RT participants 상속이 본 PR scope 인지 별 이슈인지 (engine 상속만 했으면 명시)
```

# 10. 막히면 (escalate)

- T1 의 set 순서 + effect 타이밍 race — `saveConversationEngine` 가 set 이후여도 NewMessageInput effect 가 stale read 하면 → effect dependency 또는 상속 시점 조정. 가설 보고
- 사용자 보고의 "agent 활성화" 가 engine 이 아닌 RT participants 였으면 → engine 상속 (T1) 으로 1차 해결 + RT participants 상속은 별 plan escalate
- T3 제거 후 status 변경 시 리스트 stale (refresh 안 됨) → `setPlanRefreshKey` 가 HarnessSummary + PlansPanel 모두 refresh 하는지 확인. 안 되면 refresh 경로 보강
- branch 재진입 시 상속 조건 (`!getConversationEngine`) 이 의도대로 동작 안 하면 → 상속 시점/조건 재검토

# 11. Worktree 안전 가드

- macOS APFS case-insensitive: Edit 절대 경로 sanity check
- `git rev-parse --abbrev-ref HEAD` commit 직전
- main repo 변경 발견 시 `git checkout HEAD -- <path>`
- git stash drop/pop X

# 12. 주의사항

- autonomous — 사용자 질문 금지 (위 escalate 외)
- 한국어 commit / chat 보고
- 작업 시작 전 `~/.tunaflow/skills/` 에서 zustand / branch / frontend 관련 skill 1~2 개 로딩 권장
- 핸드오프 / plan SSOT
- 머지 후 release timing Architect 영역
