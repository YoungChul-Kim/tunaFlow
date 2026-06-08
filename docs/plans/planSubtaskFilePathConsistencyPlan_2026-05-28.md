---
title: Plan/Dev/Reviewer 의 subtask file path 일관화 — slug + indexing 양 회귀
status: ready
priority: P0 (외부 사용자 가시, plan→dev 흐름 자체 깨짐)
created_at: 2026-05-28
---

# 0. Context

외부 사용자 (메신저) 보고:
- Plan chat 의 Architect 작성 요청: `docs/plans/plan.md` + `docs/plans/plan-task-01.md ~ -04.md` (1-indexed, slug=`plan`)
- Dev chat 의 Architect→Developer handoff: `docs/plans/plan-10-task-00.md ~ -03.md` (0-indexed, slug=`plan-10`)
- 같은 plan 의 같은 subtask 가 두 chat 에서 **다른 파일명** 으로 안내. Developer 가 작성한 파일을 못 찾고 hallucination 또는 작업 실패.

## Root cause — 2 axis mismatch

### slug source 불일치

| 위치 | 함수 | "신규 채널 추가" 결과 |
|---|---|---|
| `PlanProposalCard.tsx:307` (Plan chat) | frontend `slugifyPlanTitle(proposal.title)` (helpers.ts) — DB 저장 전 | `"plan"` (frontend fallback) |
| `implementWorkflow.ts:64` (Dev chat) | `getPlanSlug(plan)` = DB `plan.slug` | `"plan-10"` (backend collision counter) |
| `planWorkflowService.ts:127` (`loadTaskFileTitles`, Architect/Reviewer context) | `getPlanSlug(plan)` = DB slug | `"plan-10"` |
| `reviewWorkflow.ts:236` (Reviewer prompt) | `getPlanSlug(plan)` = DB slug | `"plan-10"` |

Backend `slugify_title` (`migrations.rs`) 마지막 줄: `if truncated.is_empty() { "plan".to_string() }` — 한글 title 모두 같은 base `"plan"` → `find_unique_slug` collision counter → `"plan"`, `"plan-2"`, ..., `"plan-10"`.

Frontend `slugifyPlanTitle` (`helpers.ts:22`) 도 같은 fallback `"plan"`. **Plan chat 만 DB 저장 전 frontend fallback 결과 사용** → backend collision counter 결과 무시.

### indexing 불일치

| 위치 | indexing | 결과 |
|---|---|---|
| DB `plan_subtasks.idx` 저장 (`plans.rs:452`) | `for (i, st) in subtasks.iter().enumerate()` — **0-indexed** | `idx = 0, 1, 2, 3` |
| `implementWorkflow.ts:70` Dev chat prompt | `String(s.idx).padStart(2, "0")` — DB idx raw | `00, 01, 02, 03` |
| `PlanProposalCard.tsx:314` Plan chat prompt | `String(i + 1).padStart(2, "0")` — **1-indexed** | `01, 02, 03, 04` |
| `planWorkflowService.ts:135` `loadTaskFileTitles` (Architect/Reviewer context) | `for (i = 1; i <= taskCount; i++)` — **1-indexed** | `01, 02, ..., N` |
| `autoRecoverSubtasks` (`planWorkflowService.ts:47`) regex | `^${slug}-task-\\d+\\.md$` — 양쪽 매칭 | backward compat |

→ Plan chat / loadTaskFileTitles / Reviewer 는 1-indexed, Dev chat 만 0-indexed. **Dev chat 의 path 가 다른 generator 모두 와 mismatch**.

## "패치 이후 사이드 이펙트" 분석

`slugify_title` 의 `if truncated.is_empty() { "plan" }` fallback 도입 시점이 회귀 시작점. 그 전엔 한글 title → backend slug = `""` (저장) → frontend `getPlanSlug` 가 falsy → frontend fallback 으로 "plan" 사용 → **두 chat 모두 `"plan"`** → slug 일관. fallback 추가 후 backend = `"plan-N"` (collision), frontend = `"plan"` 으로 분기 시작.

# 1. Invariants

- **INV-SPC-1**: 모든 generator (Plan chat / Dev chat / Reviewer prompt / context load) 가 같은 slug source 사용 — DB `plan.slug` (single source of truth)
- **INV-SPC-2**: file path indexing 1-indexed 통일 — `loadTaskFileTitles` 의 `for i=1` 기준
- **INV-SPC-3**: subtask DB `idx` 컬럼 자체는 **0-indexed 유지** — schema 변경 X. file path 생성 시점에만 `idx + 1` 적용
- **INV-SPC-4**: `autoRecoverSubtasks` 의 regex 는 양쪽 매칭 — backward compat (이전 잘못된 0-indexed file 도 검색 가능)
- **INV-SPC-5**: 새 plan 부터는 4 generator 모두 동일 path 생성 — `${db_slug}-task-${idx+1}` 패턴
- **INV-SPC-6**: backend `slugify_title` + `find_unique_slug` 동작 자체는 변경 X (별 plan 영역) — frontend 가 DB slug 받아 사용하는 것만 fix

# 2. Goals / Non-goals

## Goals
- Plan chat 의 slug source 를 DB slug 로 통일 (createPlan 응답의 `plan.slug`)
- Dev chat indexing 을 1-indexed 로 통일 (`s.idx + 1`)
- Dev chat prompt 에 전체 계획서 path 추가 (Plan chat 과 대칭)
- 신규 test — 4 generator cross-consistency 보장

## Non-goals
- backend `slugify_title` / `find_unique_slug` 변경 (collision noise 는 별 plan)
- DB schema migration (idx 0-indexed 유지)
- 기존 사용자 환경의 잘못된 file 정리 (사용자 영역, autoRecoverSubtasks 가 backward compat)
- Architect / Reviewer / Developer prompt template 변경

# 3. Subtasks

## T1 — `PlanProposalCard.tsx:307` slug source = DB slug (P0)

**파일**: `src/components/tunaflow/chat/PlanProposalCard.tsx`

```diff
-      const slug = slugifyPlanTitle(proposal.title);
+      const slug = plan.slug ?? slugifyPlanTitle(proposal.title);
```

또는 `getPlanSlug({ slug: plan.slug, title: proposal.title })` 사용 — `getPlanSlug` 는 이미 `plan.slug || slugifyPlanTitle(title)` 패턴. createPlan 응답의 plan 객체 (line 295) 의 `plan.slug` 를 사용.

## T2 — `implementWorkflow.ts:70` indexing 1-indexed 통일 (P0)

**파일**: `src/lib/workflow/implementWorkflow.ts`

```diff
   const taskItems = targetSubtasks.map((s) =>
-    `- \`docs/plans/${slug}-task-${String(s.idx).padStart(2, "0")}.md\` — ${s.title}`
+    `- \`docs/plans/${slug}-task-${String(s.idx + 1).padStart(2, "0")}.md\` — ${s.title}`
   );
```

**Rationale**: DB idx 는 0-indexed 그대로. file path 만 1-indexed (사용자 가시 task #1 = file `-01.md`). `loadTaskFileTitles` / `reviewWorkflow` / `PlanProposalCard` 와 일관.

## T3 — Dev chat prompt 에 전체 계획서 path 추가 (P1)

**파일**: `src/lib/workflow/implementWorkflow.ts`

prompt body 의 `**작업 지시서**:` 직전에:
```diff
+    `**전체 계획서**: \`docs/plans/${slug}.md\``,
+    ``,
     `**작업 지시서**:`,
     ...taskItems,
```

Plan chat 의 `docs/plans/{{slug}}.md — 전체 계획서` 와 대칭. Developer 가 전체 계획서도 같이 read 가능.

## T4 — 신규 vitest — cross-generator consistency (P0)

**파일**: `src/lib/workflow/__tests__/planFilePath.test.ts` (신규)

테스트 항목:
- 같은 plan + subtasks input 에 대해 Plan chat / Dev chat / loadTaskFileTitles 의 file path 가 일치
- slug 일관: 4 generator 모두 같은 slug
- indexing 일관: 모두 1-indexed
- 한글 title plan + DB slug `"plan-10"` 시나리오 — Plan chat 도 `"plan-10"` 사용
- 영문 title plan + DB slug = slugifyPlanTitle 결과 — 일치
- 0-indexed legacy file path (`plan-task-00.md`) 도 autoRecoverSubtasks 가 잡는지 backward compat

## T5 — 사용자 환경 정리 안내 (선택, docs)

**파일**: `docs/how-to/plan-file-migration.md` (신규, 선택)

기존 사용자가 이미 plan-task-NN.md 같은 잘못된 file 작성된 환경:
- `autoRecoverSubtasks` 가 regex `^${slug}-task-\\d+\\.md$` 로 양쪽 매칭 — 자동 backward compat
- 새 plan 부터는 정상 1-indexed
- 수동 정리 원하면 file rename — 간단한 shell snippet 예시

Non-goal — 본 plan 머지 후 사용자 메신저 답변에 포함하거나 release notes 에 명시. 별 doc 파일 안 만들어도 OK.

# 4. Cross-cutting risks

- **createPlan 응답의 `plan.slug` 가 항상 있는지** — `plans.rs:141` 의 `slug: Some(slug)` 확인됨. 항상 있음 (Option<String>). frontend type `Plan.slug?: string | null` 이지만 createPlan 직후엔 항상 truthy.
- **legacy 사용자 환경** — 기존 0-indexed file (예: `plan-10-task-00.md`) 들이 사용자 disk 에 잔존. autoRecoverSubtasks 가 잡으니 plan expand 시 정상 표시. 새 작업은 1-indexed file 작성 → 두 형식 공존 가능. 사용자가 신경 안 써도 동작.
- **prompt 변경의 prompt cache 영향** — Tier 2 분석 / Reviewer 의 cache hit 영향 가능. 다만 prompt body 그대로 (path string 만 변경) 라 minimal.
- **`loadTaskFileTitles` 의 file read 가 fail 시** — silent (try/catch). 사용자 영역 file 정리 안 했으면 일부 task title 미표시 가능. UX 영향 작음.

# 5. Rollback

T1~T4 별 commit 분리. 각 revert 가능. backend 변경 0 — frontend + test 한정 hotfix.

# 6. 다음 step

1. Developer 핸드오프 작성 — `docs/prompts/planSubtaskFilePathConsistencyDeveloperHandoff_2026-05-28.md`
2. Developer subagent dispatch (worktree 격리, admin merge — frontend 한정 + 회귀 가드 test 포함)
3. 머지 후 release timing 결정:
   - **옵션 A**: v0.1.9-beta build 가 아직 in_progress / publish 전이면 — tag 재발행 (PR 머지 후 cc1ced1 → new HEAD) 으로 같은 release 에 묶음
   - **옵션 B**: v0.1.9-beta publish 후 v0.1.9-beta-2 또는 v0.1.10-beta hotfix
4. 외부 사용자 (메신저 보고자) 회복 안내 — release URL 첨부
