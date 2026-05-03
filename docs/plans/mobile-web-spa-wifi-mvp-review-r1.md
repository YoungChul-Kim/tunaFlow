# Review Report: Mobile Web SPA (WiFi MVP) — Round 1

> Verdict: fail
> Reviewer: 
> Date: 2026-05-02 16:28
> Plan Revision: 0

---

## Verdict

**fail**

## Findings

1. mobile-spa/src/lib/api/plans.ts:15 — `PlanSubtask`가 `seq` 필드를 기대하지만 실제 `src-tauri/src/http_api/plans.rs:60`의 `/plans/{id}?include=subtasks` 응답은 `idx`를 반환합니다.
2. mobile-spa/src/pages/PlanStatusPage.tsx:79 — 위 필드 불일치 때문에 `String(st.seq).padStart(...)`가 실제 데이터에서 `Task undefined`를 렌더링합니다.

## Recommendations

1. `PlanSubtask`를 실제 API 응답에 맞춰 `idx: number`로 바꾸고 PlanStatusPage에서 `st.idx`를 사용하세요.
2. 또는 backend `load_subtasks` 응답을 task 문서의 `seq` 계약에 맞춰 `seq`로 반환하도록 통일하세요.

## Subtask Verification

| # | Subtask | Status |
|---|---------|--------|
| 1 | mobile-spa 프로젝트 스캐폴딩 | ✅ done |
| 2 | HTTP API 클라이언트 + WS 레이어 | ✅ done |
| 3 | 핵심 화면 구현 | ✅ done |
| 4 | axum Static 서빙 추가 | ✅ done |

