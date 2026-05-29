---
title: Developer 핸드오프 — docs/plans 가상 필터 + index 자동 (Phase 1)
plan: docs/plans/docsPlansOrganizationPlan_2026-05-29.md
created_at: 2026-05-29
---

# 0. 한 줄 요약

docs/plans 정리 Phase 1 — DocsSection 에 status/날짜 가상 필터 (DB plan join) + index.md 자동 생성 + Gemini #300 shallow copy squeeze. **경로 불변** (물리 이동은 Phase 2 별 PR). 기존 4개 문서 정책 정합.

# 1. SSOT
- **Plan**: `docs/plans/docsPlansOrganizationPlan_2026-05-29.md` (§3 Phase 1 = T1~T5)
- 정책 정합 근거: `documentationNavigationModel_2026-03-30.md` ("메타+인덱스로 navigation"), `documentVersioningPolicy_2026-03-30.md`, `documentMetadataSchema_2026-03-30.md` (status 필드)

# 2. PR 전략 — 단일 PR (Phase 1 만)

브랜치: `feat/docs-plans-filter-and-index`

5 commit:
- `feat(docs-panel): join DB plan metadata to docs/plans entries (T1)`
- `feat(docs-panel): status + date filter for plans section (T2)`
- `feat(plans): auto-generate index.md (active table + archive summary) (T3)`
- `fix(branch): shallow copy inherited engine (gemini PR #300 review, T4)`
- `test(docs-panel,plans): filter + index + shallow copy coverage (T5)`

각 trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

# 3. 작업 순서

T1 (DB join) → T2 (필터 UI, T1 의존) → T3 (index 자동) → T4 (shallow copy, 독립) → T5 (test)

# 4. DO

1. **필터 source = DB `plans` 테이블** (`list_plans_by_project`) — status/created_at/slug 일관. frontmatter 파싱 안 함 (옛 plan blockquote 형식 불일치 회피)
2. **T1 slug 매칭** — `docs/plans/{slug}.md` 의 파일명에서 slug 추출 → DB plan lookup. 동반 파일 (`{slug}-task-NN.md` 등) 은 Phase 1 에서 본문만 배지 (동반은 평면 또는 nest, UX 본인 판단)
3. **DB 미등록 doc graceful** — slug join 실패 시 배지 없이 표시, status 필터에서 "기타" 또는 항상 표시
4. **T2 필터는 frontend state** — 경로 불변. status (all/draft/active/done/archived) + 날짜 (all/7d/30d/월별, updated_at 기준)
5. **T3 index.md 마커 기반 부분 갱신** — `<!-- AUTO-INDEX-START -->` ~ `<!-- AUTO-INDEX-END -->` 안만 자동 생성, 수동 설명 영역 (navigationModel 의 구조 안내) 보존
6. **T4 shallow copy** — `branchSlice.ts:193` 의 `saveConversationEngine(branchConvId, parentEngine)` → `{ ...parentEngine }`. PR #300 동작 보존 + mutation 안전
7. **i18n** — 필터 칩 라벨 ko/en

# 5. DO NOT

- ❌ **월별 물리 폴더 신설** (정책 충돌, INV-DPO-2)
- ❌ 완료 plan archive 파일 이동 (Phase 2 별 PR, INV-DPO-5)
- ❌ 경로 생성/읽기 패턴 변경 (Phase 1 경로 불변, INV-DPO-3) — `generate_plan_document` / autoRecoverSubtasks / loadTaskFileTitles / ContextPack loader 변경 X
- ❌ frontmatter 형식 마이그레이션 (옛 blockquote → frontmatter)
- ❌ index.md 의 수동 설명 영역 덮어쓰기 (마커 밖 보존)
- ❌ DB plans 스키마 변경
- ❌ 새 dependency
- ❌ release version bump / tag (Architect 영역)
- ❌ `branchSlice` 의 T4 외 다른 로직 변경 (PR #300 상속 로직 보존)

# 6. Verification

```bash
cd src-tauri && cargo check --message-format=short    # T3 index command 시 Rust 변경
cd src-tauri && cargo test --lib                       # T3 index 생성 test
npx tsc --noEmit
npx vitest run                                         # baseline 496 + T5 +N
```

회귀 grep:
```bash
git diff src-tauri/src/commands/agents_helpers/  # ContextPack loader 변경 0
rg "docs/plans/\d{4}-\d{2}/" src/ src-tauri/src/  # 월폴더 경로 0 (정책 정합)
git diff src/stores/slices/branchSlice.ts | grep -E "parentEngine"  # T4 shallow copy 만
rg "list_plans_by_project" src/components/tunaflow/sidebar/DocsSection.tsx  # T1 DB join 확인
```

# 7. e2e 수동 검증 (사용자 영역)

- DocsSection 의 docs/plans 항목에 plan status 배지 (active/done 등) 표시
- status 필터 "done" 선택 → 완료 plan 만 표시
- 날짜 필터 "최근 7일" → updated_at 최근 plan
- DB 미등록 순수 doc (예: reference 문서) → graceful 표시
- index.md 자동 생성 → active 테이블 + archive 요약, 수동 설명 보존
- branch 진입 → engine 상속 (PR #300 동작 보존) + parent engine mutation 시 branch 영향 없음 (shallow copy)

GUI 제약 시 vitest mock 대체.

# 8. CI 정책

PR 직후 `gh pr merge --squash --delete-branch --admin` 즉시 머지. CI watch 불필요 (frontend + index command, cross-platform 회귀 위험 낮음). T3 가 Rust 변경 포함 시 cargo test 통과 확인 후.

# 9. 보고 포맷 (chat)

```
## docs/plans Filter + Index (Phase 1) 결과
- PR URL + 머지 commit
- task 별 변경 라인 + 핵심 파일
- §6 Verification: cargo check / cargo test / tsc / vitest +N
- §7 e2e — 자동 / 사용자 영역
- 회귀 가드 grep (월폴더 0 / ContextPack loader 0 / shallow copy 만)
- T1 동반 파일 (task/review/result) UX 처리 방식 (nest vs 평면)
- T3 index.md 마커 구조
```

# 10. 막히면 (escalate)

- T1 의 slug 매칭이 동반 파일 (`{slug}-task-NN.md`) 을 본문과 어떻게 그룹핑할지 모호 → Phase 1 은 본문 `{slug}.md` 만 배지, 동반은 평면. 더 정교한 nest 는 Phase 2 또는 별 UX
- DB 미등록 doc 비율 높으면 (reference/how-to 등) 필터 UX 혼란 → docs/plans 섹션 한정 필터 (다른 카테고리는 필터 무관)
- index.md 자동 생성이 기존 수동 구조 깨면 → 마커 기반 부분 갱신으로 수동 영역 보존, 안 되면 별 `index-auto.md` 분리 검토 + 보고
- T3 가 Rust command 면 cargo 변경 — CI watch 필요할 수도, 판단 후 보고

# 11. Worktree 안전 가드

- macOS APFS case-insensitive: Edit 절대 경로 sanity check
- `git rev-parse --abbrev-ref HEAD` commit 직전
- main repo 변경 발견 시 `git checkout HEAD -- <path>`
- git stash drop/pop X

# 12. 주의사항

- autonomous — 사용자 질문 금지 (위 escalate 외)
- 한국어 commit / chat 보고
- 작업 시작 전 `~/.tunaflow/skills/` 에서 frontend / zustand / plans 관련 skill 1~2 개 로딩 권장
- 핸드오프 / plan SSOT
- Phase 2 (archive 이동) 는 본 PR 비대상 — Phase 1 머지 + 사용자 검증 후 별 plan
