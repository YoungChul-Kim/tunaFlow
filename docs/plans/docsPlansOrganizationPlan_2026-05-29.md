---
title: docs/plans 정리 — 가상 필터(상태/날짜) + index 자동 생성 + 완료 archive 이동
status: ready
priority: P2 (외부 사용자 요청, 기존 문서 정책 정합)
created_at: 2026-05-29
---

# 0. Context

다모앙 커뮤니티 사용자 요청: docs/plans 폴더에 md 가 계속 쌓여 관리가 힘듦. 날짜/상태별 그룹 + README 요약 + 앱 내 리딩 원함.

## 기존 문서 정책 (4 SSOT 문서) 정합 분석

| 문서 | 핵심 입장 |
|---|---|
| `documentationNavigationModel_2026-03-30.md` | "문서 많은 게 문제가 아니라 역할/읽기순서 불명확이 문제. **삭제/이동보다 (1)타입구분 (2)읽기순서 (3)인덱스 품질 (4)아카이브 구분**" |
| `documentNamingRule_2026-03-30.md` | 3층 분리 — 파일명=식별자 / title=사람용 / **meta·index=현재성·관계** |
| `documentVersioningPolicy_2026-03-30.md` | Plan=작업단위 새 문서 + **index 필수** / **아카이브=상태 변경** (`status: archived` + `superseded_by`) |
| `documentMetadataSchema_2026-03-30.md` | frontmatter `status` 필드 이미 정의 (draft/in_progress/partial/done/archived) + `updated_at` |

**결론**: 기존 SSOT 철학 = **"물리 폴더 신설보다 메타데이터 + 인덱스로 navigation"**. 월별 물리 폴더 신설은 기존 plans(카테고리) + archive(상태) 2축 위에 새 날짜 축을 겹쳐 정책과 충돌 → **채택 안 함**.

## 현재 구조 + 진짜 원인

- `docs/plans/` = active plan **평면** (142 파일, 작업단위 날짜 파일명)
- `docs/archive/plans/{completed, deferred, misc, superseded}/` = **완료/보류 이미 상태 폴더로 물리 분리됨**
- frontmatter `status` 필드 신규 plan 에 있음 (옛 plan 일부는 `> Status:` blockquote 형식 불일치)

142개 누적 원인:
1. 완료된 plan 이 `docs/plans/` → archive 로 **자동 이동 안 됨** (수동 정책, 안 옮겨짐)
2. 한 plan 의 `slug-task-NN.md` / `-review-rN.md` / `-result.md` 동반 누적
3. `index.md` 수동 갱신 (stale, 2026-04-22)

# 1. Invariants

- **INV-DPO-1**: 필터/정리 source 의 SSOT = DB `plans` 테이블 (status/created_at/slug 일관). frontmatter 는 보조 (DB 미등록 순수 doc)
- **INV-DPO-2**: 기존 plans/archive **2-state 물리 구조 유지** — 월별 폴더 신설 X (정책 정합)
- **INV-DPO-3**: 가상 필터는 경로 불변 (frontend 필터링) — backward compat 위험 0
- **INV-DPO-4**: index 자동 생성이 기존 수동 index.md 구조 (active 테이블 + archive 섹션) 보존
- **INV-DPO-5**: Phase 2 (완료 plan archive 이동) 는 파일 이동 + ContextPack/autoRecover 경로 영향 — 신중, 재귀 읽기로 backward compat
- **INV-DPO-6**: ContextPack plan loader / autoRecoverSubtasks / loadTaskFileTitles 의 경로 의존성 보존 (Phase 2 시 재귀 읽기 도입)

# 2. Goals / Non-goals

## Goals
- **Phase 1 (즉시, 이 PR)**: 가상 필터 (status + 날짜) + index.md 자동 생성. 경로 불변
- **Phase 2 (후속 PR)**: 완료 plan 의 archive 자동/반자동 이동 (동반 파일 포함) + 재귀 읽기

## Non-goals
- 월별 물리 폴더 신설 (정책 충돌)
- frontmatter 형식 통일 마이그레이션 (옛 plan blockquote → frontmatter) — 별 작업
- DB plan 미등록 순수 doc 의 필터 (DB join 안 되는 doc 은 필터 대상 외, 평면 표시)

# 3. Subtasks

## Phase 1 — 가상 필터 + index 자동 (이 PR)

### T1 — DocsSection 에 DB plan 메타 join (P2)

**파일**: `src/components/tunaflow/sidebar/DocsSection.tsx` + backend `list_project_docs` (또는 별 command)

- DocsSection 의 `docs/plans/` 항목에 대해 파일명 slug → DB plan lookup (`list_plans_by_project` 활용)
- plan md (`{slug}.md`) 에 plan 의 status / updated_at 배지 표시
- DB 미등록 md (순수 doc) 는 배지 없이 표시 (graceful)

### T2 — status + 날짜 필터 UI (P2)

**파일**: `src/components/tunaflow/sidebar/DocsSection.tsx`

- `docs/plans/` 섹션에 필터 칩/드롭다운:
  - **status**: all / draft / active(in_progress) / done / archived
  - **날짜**: all / 최근 7일 / 최근 30일 / 월별 (updated_at 기준)
- 필터는 frontend state (경로 불변). DB plan join 결과로 필터링
- DB 미등록 doc 은 status 필터 무관하게 표시 (또는 "기타" 그룹)

### T3 — index.md 자동 생성 (P2)

**파일**: backend (`plans.rs` 또는 별 command) + 호출 site

- `docs/plans/index.md` 자동 생성/갱신:
  - active plan 테이블 (title / status / updated_at / slug link)
  - archive 요약 (completed/deferred/misc/superseded 카운트 + 링크)
- 생성 시점: plan create/status 변경 시 lazy 또는 수동 trigger command (`regenerate_plans_index`)
- 기존 수동 index.md 구조 (navigationModel 정합) 보존 — 자동 섹션만 갱신, 수동 설명 영역 보존 (마커 기반)

### T4 — Gemini #300 shallow copy squeeze (P2, 사용자 1.B 결정)

**파일**: `src/stores/slices/branchSlice.ts:193`

```diff
-      get().saveConversationEngine(branchConvId, parentEngine);
+      get().saveConversationEngine(branchConvId, { ...parentEngine });
```
shadow conv engine 상속 시 shallow copy — shared-state mutation 방지 (Gemini PR #300 review medium). 본 PR 에 묶음.

### T5 — Phase 1 test (P2)

- T1: slug → DB plan join (mock)
- T2: status/날짜 필터 동작 + DB 미등록 doc graceful
- T3: index.md 자동 생성 형식 (active 테이블 + archive 섹션)
- T4: shallow copy — 상속 후 parent/branch engine 독립 mutation 검증

## Phase 2 — 완료 plan archive 이동 (후속 PR, 별 핸드오프)

### T6 — 완료 plan archive 자동 이동 (P3, 후속)

- plan status = done/archived 시 `docs/plans/{slug}*.md` (본문+task+review+result) → `docs/archive/plans/{completed|superseded}/` 이동
- 동반 파일 일괄 이동 + `superseded_by` 메타
- ContextPack loader / autoRecoverSubtasks / loadTaskFileTitles 를 **재귀 읽기** (`docs/plans/**` slug 매칭) 로 전환 → backward compat 자동
- migration script (기존 142개 중 done plan 일괄 이동) — 선택적
- **별 plan + 핸드오프** — 파일 이동이라 신중, Phase 1 머지 + 사용자 검증 후 진행

# 4. Cross-cutting risks

- **DB plan join 의 slug 매칭**: `{slug}.md` 외 `{slug}-task-NN.md` 등 동반 파일도 같은 plan 으로 그룹핑할지 — Phase 1 은 본문 `{slug}.md` 만 plan 배지, 동반 파일은 그 아래 nest 또는 평면 (UX 결정)
- **옛 plan frontmatter 불일치**: `> Status:` blockquote 형식 plan 은 DB 에도 없을 수 있음 → DB join 실패 → graceful "기타" 처리
- **index.md 수동 영역 보존**: navigationModel 의 수동 설명 (구조 안내) 을 자동 생성이 덮어쓰지 않도록 마커 (`<!-- AUTO-INDEX-START/END -->`) 기반 부분 갱신
- **Phase 2 재귀 읽기 성능**: `docs/plans/**` 재귀 glob 이 142+ 파일에서 느릴 수 있음 — Phase 2 에서 캐싱 검토

# 5. Rollback

Phase 1 T1~T5 별 commit 분리. 경로 불변이라 revert 안전. Phase 2 는 별 PR (파일 이동이라 migration revert 신중).

# 6. 다음 step

1. Developer 핸드오프 (Phase 1 만) — `docs/prompts/docsPlansOrganizationDeveloperHandoff_2026-05-29.md`
2. Developer subagent dispatch (Phase 1: 가상 필터 + index 자동 + shallow copy)
3. Phase 1 머지 + 사용자 검증 후 Phase 2 (archive 이동) 별 plan 진행
