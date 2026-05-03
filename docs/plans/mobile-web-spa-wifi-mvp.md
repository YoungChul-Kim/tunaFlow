# Mobile Web SPA (WiFi MVP) — Plan Document

## Overview

외부에서 폰/패드로 사내 LAN의 개발 PC에서 실행 중인 tunaFlow를 핸들링할 수 있는 독립 모바일 SPA를 구축한다. 기존 axum HTTP API(포트 19840, `0.0.0.0` 바인딩 — `src-tauri/src/http_api/mod.rs:126`)를 그대로 활용하며, `mobile-spa/` 디렉토리에 Vite + React 앱을 신규 작성하고 axum에 static 서빙을 추가한다.

- **브랜치**: `feats/mobile-support`
- **접근 방법**: Option 2 — 독립 SPA (기존 Tauri 프론트 무수정)
- **Connection Discovery**: `commands/mobile.rs` + `MobileSection.tsx` 이미 완성 (별도 구현 불필요)
- **MVP 범위**: 외부 접속 + 대화 읽기/메시지 전송 + 플랜 상태 조회. Plan 승인/Roundtable 시작/Branch 분기 등 B-범위 액션 UI는 v2.0에서 사용 경험 기반으로 결정.

## Goal

폰을 사내 WiFi에 붙인 뒤 `http://<PC-IP>:19840/mobile/` 접속 → URL+토큰 입력 → 대화 목록 → 채팅(실시간 스트리밍) + 플랜 상태 조회까지 가능.

## Subtask Summary

| # | 제목 | 상태 | Parallel Group | Depends On |
|---|------|------|---------------|------------|
| 01 | mobile-spa 프로젝트 스캐폴딩 | 미시작 | A | — |
| 02 | HTTP API 클라이언트 + WS 레이어 | 미시작 | B | 01 |
| 03 | 모바일 SPA 핵심 화면 구현 | 미시작 | C | 02 |
| 04 | axum Static 서빙 추가 | 미시작 | B | 01 |

> Task 02와 Task 04는 Task 01 완료 후 병렬 진행 가능.
> Task 03은 Task 02 완료 후 시작.

## Architecture

```
feats/mobile-support/
├── mobile-spa/                    ← 신규 Vite 앱
│   ├── package.json
│   ├── vite.config.ts             base: /mobile/, outDir: ../src-tauri/resources/mobile-spa
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                React Router 라우팅
│       ├── lib/
│       │   ├── connect.ts         URL + token (localStorage)
│       │   └── api/
│       │       ├── client.ts      fetch 래퍼
│       │       ├── ws.ts          WebSocket + 재연결
│       │       ├── conversations.ts
│       │       ├── agents.ts
│       │       └── plans.ts
│       └── pages/
│           ├── ConnectPage.tsx    URL + token 입력
│           ├── ConversationListPage.tsx
│           ├── ChatPage.tsx       메시지 + 실시간 스트리밍
│           └── PlanStatusPage.tsx
│
├── src-tauri/
│   ├── Cargo.toml                 tower-http features: ["cors", "fs"] 추가
│   ├── tauri.conf.json            bundle.resources: mobile-spa 등록
│   └── src/http_api/mod.rs        /mobile/ ServeDir 라우트 추가
│
└── (기존 코드 변경 없음)
     src/components/tunaflow/settings/MobileSection.tsx  ← 이미 완성
     src-tauri/src/commands/mobile.rs                    ← 이미 완성
```

## 선행 진척물 (인계)

`mobile-spa/` 디렉토리에 Task 01의 스캐폴딩 + Task 03의 mock 기반 페이지(`pages/{ConnectPage,ConversationListPage,ChatPage,PlanStatusPage}.tsx`, `components/{BottomNav,MessageBubble}.tsx`, `lib/{mock,time}.ts`)가 일부 선행 구현되어 있음. Developer는 이 구조를 폐기하지 말고:

- Task 01: 기존 `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` 가 본 문서 명세와 일치하는지 검증 → 갭만 보완.
- Task 03: 기존 mock 페이지의 `import { ... } from '../lib/mock'` 호출을 Task 02 산출물 `lib/api/*` 모듈 호출로 교체.

## Non-goals

- 기존 Tauri 프론트의 invoke → HTTP 추상화 (Option 3)
- HTTPS / TLS 내장, Tailscale 등 외부 터널 (별도 plan)
- Plan 승인/거절 UI · Roundtable 실행 UI · Branch 분기 UI (v2.0)
- Settings 화면 12개 섹션 모바일 UI (B 범위 외)
- Sidebar의 Docs/Files/Scratchpad 모바일 화면
- Context Panel 패널들(Insight/Trace/Memos/Skills 등) 모바일 화면
- iOS/Android 네이티브 앱, PWA 오프라인, 다중 토큰

## Version

v1.0 — 2026-05-02 (초안)
