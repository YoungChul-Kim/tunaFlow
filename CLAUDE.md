# tunaFlow — Claude Code Handoff Document

## 1. Project Overview

tunaFlow는 **다중 에이전트 오케스트레이션 클라이언트(AOC)**이다. Tauri 2 + React + TypeScript + Rust + SQLite 기반 데스크톱 앱으로, Claude Code / Codex / Gemini / Ollama / LM Studio 등 5종의 CLI 코딩 에이전트를 하나의 Plan → Dev → Review 워크플로우 아래에서 통합 운용한다. Roundtable 토론, Branch 분기, ContextPack 프롬프트 조립, rawq 코드 검색 등 에이전트 중심 개발 경험을 제공한다.

> **"Of the agent, By the agent, For the agent"** — 사용자가 도메인 지식과 방향을 결정하고, 에이전트가 최적의 조건에서 실행한다.

SSOT: `docs/reference/dataModelRevised.md` (도메인 모델), `docs/reference/implementationStatus.md` (구현 현황)
세션 이력: `docs/reference/sessionHistory.md`

## 2. 기술 스택

| 계층 | 기술 |
|------|------|
| Desktop shell | Tauri 2 |
| Frontend | React 18 + TypeScript + Zustand 5 + Tailwind CSS 4 |
| Backend | Rust (tauri commands) |
| DB | SQLite (WAL mode, dual read/write connections) |
| Agent CLI | claude, codex (OpenAI), gemini (Google), ollama / lmstudio (openai-compat) — UI 연결 5종 |
| Markdown rendering | react-markdown + remark-gfm + react-syntax-highlighter (Prism + oneDark) |
| Icons | Lucide React |
| Code search | rawq (sidecar binary, daemon mode) |
| Build tooling | Vite, tsc |
| Test | Vitest (frontend), cargo test (Rust) |

## 3. 빌드 / 테스트

```bash
# 개발 실행
npm run tauri dev

# 빌드 검증
npx tsc --noEmit              # TypeScript 타입 체크
npx vite build                # Frontend 빌드
cd src-tauri && cargo check   # Rust 체크

# 테스트
npx vitest run                # Frontend (317 tests)
cd src-tauri && cargo test --lib  # Rust unit tests (485 tests)

# rawq sidecar 준비
./scripts/build-rawq.ps1      # Windows
./scripts/build-rawq.sh       # macOS/Linux

# Skills snapshot 발행
./scripts/publish-skills.sh
```

## 4. 코딩 컨벤션

> 상세: `docs/reference/coding-convention.md` — 코드 작성/수정 전에 읽는다.

- 한국어 응답 / 코드·경로·식별자는 원문 유지.
- Zustand는 selector 기반. Tauri sync command 중 UI hot-path는 `async + spawn_blocking`.
- 5-engine parity: 모든 UI 연결 엔진(claude/codex/gemini/ollama/lmstudio)이 `build_normalized_prompt_with_budget()` 단일 경로.
- Tailwind flexbox: column 자식에 `min-h-0` 필수 (`docs/reference/flexboxConventions.md`).
- `find → fd` / `grep → rg` / `sed → sd` / `cat → bat`. 멀티 파일 치환은 `fd ... | xargs sd ...`.

## 5. 작업 안전 규칙

> 상세: `docs/reference/work-safety.md`

- UI 진입점 변경 전에 대체 경로 작동 확인.
- 한 번에 한 경로만 수정 → 검증 → 다음 경로.
- `finalize_engine_run` 처럼 mutex re-entrant 가능한 자리는 특히 주의.

## 6. 다음 우선순위

- Project-per-window 아키텍처 (`docs/ideas/projectPerWindowIdea.md`)
- KnowledgeLayer trait — 6번째 소스 추가 시 도입
- 온보딩 메타에이전트 (`docs/ideas/onboardingMetaAgentIdea.md`)
- 디자인 시스템 확대 — text-tf-*/prose-* 토큰 점진 교체
- Ollama / LM Studio base URL override UI (`docs/plans/customEndpointConfigPlan_2026-04-24.md`)

## 7. 문서 참조

| 문서 | 용도 |
|------|------|
| `docs/reference/sessionHistory.md` | 세션 이력 전체 |
| `docs/reference/dataModelRevised.md` | 도메인 모델 SSOT |
| `docs/reference/implementationStatus.md` | 기능별 구현 현황 |
| `docs/reference/branchSessionPolicy.md` | branch session = main session 공유 원칙 |
| `docs/reference/architecture-detail.md` | 프로젝트 구조, RT 흐름, Store, DB 스키마 |
| `docs/reference/coding-convention.md` | 코딩 컨벤션 |
| `docs/reference/work-safety.md` | 작업 안전 규칙 |
| `docs/reference/flexboxConventions.md` | Tailwind flexbox invariant |
| `docs/reference/tool-usage.md` | 개발 도구 (fd/rg/rawq 등) |
| `docs/plans/index.md` | Plan 상태 인덱스 |
| `docs/prompts/index.md` | 실행 프롬프트 인덱스 |

## 8. Skill 로딩 규칙

| 작업 유형 | 추천 스킬 |
|-----------|-----------|
| 프론트엔드 구현 | `anthropic-frontend-design`, `microsoft-zustand-store-ts` |
| 프론트엔드 리뷰 | `microsoft-frontend-design-review`, `anthropic-webapp-testing` |
| OpenAI/Codex 연동 | `openai-openai-docs` |
| Claude/Anthropic 연동 | `anthropic-claude-api` |
| MCP/tool 연동 | `anthropic-mcp-builder` |

---

> Auto-detected by tunaFlow. 내용을 검토하고 필요하면 수정하세요.