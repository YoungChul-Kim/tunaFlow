---
title: Developer 핸드오프 — Plan/Dev/Reviewer subtask file path 일관화
plan: docs/plans/planSubtaskFilePathConsistencyPlan_2026-05-28.md
created_at: 2026-05-28
---

# 0. 한 줄 요약

외부 사용자 메신저 보고: Plan chat 안내 (`plan-task-01.md ~ -04.md`) 와 Dev chat handoff (`plan-10-task-00.md ~ -03.md`) 의 파일명 mismatch — slug + indexing 두 axis 의 일관성 부재. 4 task hotfix.

# 1. SSOT
- **Plan**: `docs/plans/planSubtaskFilePathConsistencyPlan_2026-05-28.md` (§3 T1~T4)
- 진단 root cause: slug source 분기 (`slugifyPlanTitle` 의 frontend fallback "plan" vs backend `find_unique_slug` collision "plan-10") + indexing 분기 (Plan chat 1-indexed / Dev chat 0-indexed)

# 2. PR 전략 — 단일 PR

브랜치: `fix/plan-subtask-file-path-consistency`

4 commit:
- `fix(plan-proposal): slug source = DB plan.slug (avoid frontend fallback divergence) (T1)`
- `fix(implement-workflow): indexing 1-based for task file path (align with Plan chat / loadTaskFileTitles) (T2)`
- `feat(implement-workflow): include full plan document path in dev handoff (T3)`
- `test(workflow): cross-generator file path consistency coverage (T4)`

각 trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

# 3. 작업 순서

T1 → T2 → T3 → T4. 각 commit 독립 revert 가능.

# 4. DO

1. **`PlanProposalCard.tsx:307`** — `slug = slugifyPlanTitle(proposal.title)` → `slug = plan.slug ?? slugifyPlanTitle(proposal.title)`. createPlan 응답의 `plan` 객체 (line 295) 의 `plan.slug` 사용. `getPlanSlug` import 해서 `getPlanSlug({ slug: plan.slug, title: plan.title })` 도 OK (더 명시적)
2. **`implementWorkflow.ts:70`** — `String(s.idx).padStart(2, "0")` → `String(s.idx + 1).padStart(2, "0")`. DB idx 자체는 0-indexed 그대로, file path 만 1-indexed
3. **`implementWorkflow.ts`** — prompt body 의 `**작업 지시서**:` 라인 직전에 `**전체 계획서**: \`docs/plans/${slug}.md\`` + 빈 줄 추가
4. **신규 test** `src/lib/workflow/__tests__/planFilePath.test.ts`:
   - **case 1 (slug 일관)**: 한글 title plan + DB slug `"plan-10"` — Plan chat / Dev chat / loadTaskFileTitles 모두 같은 slug 사용
   - **case 2 (indexing 일관)**: 4 subtask plan — Plan chat: `01..04`, Dev chat: `01..04` (T2 fix 후), loadTaskFileTitles: `01..04` 모두 일치
   - **case 3 (영문 title)**: 영문 title plan — DB slug = slugifyTitle 결과 = title-based — 일치
   - **case 4 (legacy backward compat)**: `autoRecoverSubtasks` regex 가 0-indexed file (`plan-task-00.md`) + 1-indexed file (`plan-task-01.md`) 모두 매칭 — backward compat 보장

# 5. DO NOT

- ❌ backend 변경 (`migrations.rs::slugify_title` / `plans.rs::find_unique_slug` / DB schema) — Non-goal, 별 plan 영역
- ❌ `loadTaskFileTitles` / `autoRecoverSubtasks` / `reviewWorkflow.ts` 의 file path 패턴 변경 — 이미 1-indexed + DB slug 사용 중이라 변경 X
- ❌ subtask DB idx 컬럼의 0-indexed → 1-indexed migration (INV-SPC-3)
- ❌ Architect / Reviewer / Developer 의 prompt template (`project_tools.rs::*_TEMPLATE`) 변경
- ❌ frontend `slugifyPlanTitle` (helpers.ts) 의 fallback "plan" 자체 변경 (별 영역)
- ❌ 새 dependency 추가
- ❌ 사용자 환경의 기존 file 자동 rename (백워드 compat 으로 충분)
- ❌ release version bump / CHANGELOG 갱신 / tag push — Architect 영역 (PR 머지 후)

# 6. Verification

```bash
cd src-tauri && cargo check --message-format=short    # 변경 0
npx tsc --noEmit
npx vitest run                                         # FE 478 + T4 신규 +N
cd src-tauri && cargo test --lib                       # baseline 658 동일 (Rust 미변경)
```

회귀 grep:
```bash
git diff src-tauri/                                                  # 변경 0
git diff src/lib/workflow/helpers.ts                                 # 변경 0 (slugifyPlanTitle 보존)
git diff src/lib/workflow/reviewWorkflow.ts                          # 변경 0
git diff src/lib/workflow/planWorkflowService.ts                     # 변경 0
rg "slugifyPlanTitle\(" src/components/tunaflow/chat/PlanProposalCard.tsx  # fallback 1 곳만 (T1 fix 후)
rg "s\.idx\)\.padStart" src/lib/workflow/                            # 0 매치 (T2 fix 후, s.idx + 1 으로 변경)
```

# 7. e2e 수동 검증 (사용자 영역)

가능한 한 vitest 자동 cover. 사용자 환경 검증:

- 한글 title plan 신규 생성 → Plan chat 안내 = Dev chat handoff 의 파일명 일치
- Dev chat 의 전체 계획서 path (`docs/plans/{slug}.md`) 명시 확인
- 영문 title plan — 동일 일관성
- legacy plan (이전 0-indexed 환경) — `autoRecoverSubtasks` 가 잡아서 plan expand 정상 표시

# 8. CI 정책

PR 직후 `gh pr merge --squash --delete-branch --admin` 즉시 머지. CI watch 불필요 (frontend 한정, cross-platform 회귀 위험 0). 자체 검증 §6 통과 후 self-merge.

# 9. 보고 포맷 (chat)

```
## Plan Subtask File Path Consistency 결과
- PR URL + 머지 commit
- task 별 변경 라인 수 + 핵심 파일
- §6 Verification: cargo check / tsc / vitest 신규 +N
- §7 e2e — 자동 / 사용자 영역 분리
- 회귀 가드 grep (backend 0 / 다른 영역 0)
- 4 generator (Plan chat / Dev chat / loadTaskFileTitles / autoRecoverSubtasks) cross-consistency 확인
```

# 10. 막히면 (escalate)

- `plan.slug` 가 createPlan 응답에 누락된 케이스 — frontend type `Plan.slug?: string | null` 이지만 backend 가 항상 `Some(slug)` 채우는지 plans.rs:141 확인. 누락 시 backend 영역 escalate
- T4 의 cross-generator test 에서 실제 file system 의존성 — vitest mock 으로 `invoke("read_text_file")` / `invoke("get_project")` 둘 다 stub
- legacy file (0-indexed) 에서 task 번호 1 부터 시작하는 plan — autoRecoverSubtasks 가 sort 결과 0,1,2,3 으로 인식 vs 1,2,3,4 로 인식 차이 가능. 그대로 두고 사용자 영역 정리 또는 doc 안내
- prompt body 변경으로 인한 prompt cache miss — 영향 작음. Tier 2 분석 한정 — release notes 에 명시 권장

# 11. Worktree 안전 가드

- macOS APFS case-insensitive: Edit 절대 경로 sanity check
- `git rev-parse --abbrev-ref HEAD` commit 직전
- main repo 변경 발견 시 `git checkout HEAD -- <path>`
- git stash drop/pop X

# 12. 주의사항

- autonomous — 사용자 질문 금지 (위 escalate 외)
- 한국어 commit / chat 보고
- 핸드오프 / plan SSOT
- 머지 후 release timing (v0.1.9-beta 안 묶음 vs 별 hotfix) 결정 Architect 영역
- 외부 사용자 메신저 답변 — release publish 후 Architect 가 안내
