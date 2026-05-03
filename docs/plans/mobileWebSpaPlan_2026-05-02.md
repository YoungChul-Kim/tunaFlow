# Mobile Web SPA — Plan Document

## Overview

스마트폰 브라우저에서 tunaFlow를 사용할 수 있는 독립 모바일 SPA를 구축한다.
기존 axum HTTP API(포트 19840, `0.0.0.0` 바인딩)를 그대로 활용하며,
`mobile-spa/` 디렉토리에 Vite + React 앱을 신규 작성하고 axum에 static 서빙을 추가한다.

- **브랜치**: `feats/mobile-support`
- **접근 방법**: Option 2 — 독립 SPA (기존 Tauri 프론트 수정 없음)
- **Connection Discovery**: `commands/mobile.rs` + `MobileSection.tsx` 이미 완성 (별도 구현 불필요)

## Subtask Summary

| # | 제목 | 상태 | Parallel Group | Depends On |
|---|------|------|---------------|------------|
| 01 | mobile-spa 프로젝트 스캐폴딩 | 미시작 | A | — |
| 02 | HTTP API 클라이언트 레이어 | 미시작 | B | 01 |
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
│   ├── tauri.conf.json            resources: mobile-spa 등록
│   └── src/http_api/mod.rs        /mobile/ ServeDir 라우트 추가
│
└── (기존 코드 변경 없음)
     src/components/tunaflow/settings/MobileSection.tsx  ← 이미 완성
     src-tauri/src/commands/mobile.rs                    ← 이미 완성
```

## Non-goals

- 기존 Tauri 프론트 코드의 invoke → HTTP 추상화 (Option 3)
- HTTPS / TLS 내장 (Tailscale 등 외부 터널은 별도 플랜)
- Roundtable 실행 UI
- iOS/Android 네이티브 앱
- PWA 오프라인 지원
- 다중 토큰 / 사용자별 권한 분리

## Version

v1.0 — 2026-05-02 (초안)
