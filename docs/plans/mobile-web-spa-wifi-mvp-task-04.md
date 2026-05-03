# Task 04 — axum Static 서빙 추가

## Changed files

| 경로 | 상태 |
|------|------|
| `src-tauri/Cargo.toml` (line 62) | 수정: `tower-http` features에 `"fs"` 추가 |
| `src-tauri/src/http_api/mod.rs` | 수정: `/mobile/` ServeDir 라우트 + `mobile_spa_dir` 계산 추가 |
| `src-tauri/tauri.conf.json` (`bundle` 섹션) | 수정: `resources` 항목 추가 |

## Change description

axum 서버가 `/mobile/` 경로에서 `mobile-spa` 빌드 결과물을 정적으로 서빙하도록 한다. SPA 라우팅을 위해 알 수 없는 경로는 `index.html`로 fallback.

### 1. Cargo.toml — tower-http `fs` feature 추가

**현재** (`src-tauri/Cargo.toml:62`):
```toml
tower-http = { version = "0.6", features = ["cors"] }
```

**변경 후**:
```toml
tower-http = { version = "0.6", features = ["cors", "fs"] }
```

`ServeDir`과 `ServeFile`이 `fs` feature 에 포함.

### 2. http_api/mod.rs — ServeDir 라우트 추가

**파일 상단 import 추가**:
```rust
use tauri::Manager;
use tower_http::services::{ServeDir, ServeFile};
```

`tauri::Manager` 는 `app_handle.path()` 에 필요.

**`start_server` 함수 (현 line 103-141) 내, `build_router` 호출 전**:
```rust
let mobile_spa_dir = app_handle
    .path()
    .resource_dir()
    .map(|p| p.join("mobile-spa"))
    .unwrap_or_else(|_| std::path::PathBuf::from("resources/mobile-spa"));

if !mobile_spa_dir.exists() {
    eprintln!(
        "[http-api] mobile-spa not found at {:?} — /mobile/ disabled (run `cd mobile-spa && npm run build` first)",
        mobile_spa_dir,
    );
}
```

**`build_router` 시그니처 변경**: `mobile_spa_dir: std::path::PathBuf` 파라미터 추가, `start_server` 에서 인자 전달.

**라우터에 `/mobile` nest_service 추가** (`build_router` 내, 기존 `Router::new().nest("/api/v1", ...)` 바로 뒤 또는 `.layer(...)` 직전):
```rust
let mobile_service = ServeDir::new(&mobile_spa_dir)
    .fallback(ServeFile::new(mobile_spa_dir.join("index.html")));

Router::new()
    .nest("/api/v1", rest.clone())
    .nest("/api", rest)
    .route("/ws/events", get(ws::ws_events))
    .nest_service("/mobile", mobile_service)
    .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware))
    .layer(middleware::from_fn(deprecation_header_middleware))
    .layer(CorsLayer::permissive())
    .with_state(state)
```

**중요**: `auth::auth_middleware` 는 `/api/*` 와 `/ws/events` 만 보호하도록 현 구현이 처리하고 있어야 함. 만약 `/mobile/*` 정적 자산까지 401 을 반환하면 ConnectPage 자체가 로드 안 됨 → `auth::auth_middleware` 안에 `if path.starts_with("/mobile") { return next.run(req).await }` 라인이 있는지 확인하고 없으면 추가. (별도 sub-task로 분리하지 않은 이유: 5줄 이내, 본 task의 핵심 기능과 직결.)

### 3. tauri.conf.json — `resources` 추가

**현재** `bundle` 섹션 (line 30-49) 에 `resources` 필드 없음. 다음을 추가:
```json
"bundle": {
  "active": true,
  "targets": ["app", "dmg", "appimage", "deb", "rpm", "nsis"],
  "resources": ["resources/mobile-spa"],
  "windows": { "nsis": { "displayLanguageSelector": false } },
  "icon": [ ... ],
  "externalBin": ["binaries/rawq"],
  "macOS": { "signingIdentity": "-" }
}
```

`tauri build` 시 `src-tauri/resources/mobile-spa/` 가 앱 번들에 포함되어 `app_handle.path().resource_dir()` 로 접근 가능.

**개발 모드(`tauri dev`)**: `resource_dir()` 가 `src-tauri/target/debug/` 또는 유사 경로를 반환할 수 있어 `mobile-spa` 파일이 없을 수 있음. `mobile_spa_dir.exists()` 체크로 graceful 처리. 개발자는 `cd mobile-spa && npm run build` 를 한 번 돌려 `src-tauri/resources/mobile-spa/` 를 만들어 두고 진행.

### 4. README 빌드 순서 (선택, 권장)

```bash
# 1. 모바일 SPA 빌드
cd mobile-spa && npm run build
# → ../src-tauri/resources/mobile-spa/ 생성됨

# 2. Tauri 빌드 (또는 dev)
npm run tauri build
```

본 task 범위에 README 수정은 포함하지 않음 (별도 docs 작업).

## Dependencies

Task 01 완료 후 시작 (`src-tauri/resources/mobile-spa/index.html` 산출물 경로 기준 — 빌드 결과가 없어도 graceful 처리되어 cargo check 자체는 통과).

Task 02, 03 과 병렬 실행 가능.

## Verification

```bash
# 1. Rust 컴파일 — 에러 0
cd src-tauri && cargo check

# 2. tower-http feature 확인
grep 'tower-http.*"fs"' src-tauri/Cargo.toml

# 3. mod.rs 변경 확인 — nest_service("/mobile" ...) 존재
grep -n 'nest_service.*"/mobile"' src-tauri/src/http_api/mod.rs

# 4. tauri.conf.json resources 등록 확인
grep -n '"resources"' src-tauri/tauri.conf.json

# 5. (Task 01 완료 + mobile-spa 빌드 후) Manual: npm run tauri dev 실행 →
#    같은 PC 브라우저에서 http://localhost:19840/mobile/ 접속
#    → ConnectPage HTML 반환 확인 (React 앱 로드)

# 6. (Task 02/03 완료 후) Manual: 다른 단말 (사내 WiFi) 에서
#    http://<PC-LAN-IP>:19840/mobile/conversations 직접 접속
#    → SPA fallback 동작: index.html 반환 후 React Router 가 /conversations 처리 확인
```

## Risks

- `app_handle.path().resource_dir()` — Tauri 2 에서 `tauri::Manager` trait import 필수. 누락 시 컴파일 에러로 즉시 발견.
- `tauri dev` 중 `resource_dir()` 가 `src-tauri/` 기준이 아닐 수 있음 — `mobile_spa_dir.exists()` 체크로 graceful. 첫 시도 시 `/mobile/` 가 안 뜨면 `cd mobile-spa && npm run build` 후 데스크톱 앱 재시작.
- `auth::auth_middleware` 가 `/mobile/*` 를 차단하면 정적 자산 로드 자체 실패. 본 task 안에서 middleware 의 path-skip 로직 확인 필수.
- `ServeDir` 자체는 인증 우회가 의도된 동작 — token 은 ConnectPage 에서 사용자가 직접 입력 후 `/api/*` 호출에 적용. 정적 자산 공개 노출은 LAN 환경에서 허용.
- Tauri 2 `resources` 필드 형식 — `["resources/mobile-spa"]` (디렉토리 1개) vs `{"resources/mobile-spa/**/*": "mobile-spa/"}` (mapping) 둘 다 동작 가능하나 mapping 형식이 일부 버전에서 미동작 보고 있음. 단순 배열 형식 권장.

## Scope boundary (수정 금지)

- `src-tauri/src/http_api/auth.rs` — middleware path-skip 라인 1-2 줄 추가 외 로직 변경 금지 (별도 PR 가치).
- `src-tauri/src/http_api/{conversations,agents,plans,events,insight,meta,state,ws}.rs` — 본 task 범위 외, 미수정.
- `src-tauri/src/commands/mobile.rs` — 이미 완성, 미수정.
- `src/components/tunaflow/settings/MobileSection.tsx` — 이미 완성, 미수정.
- `mobile-spa/**` — Task 01/02/03 영역.
- 루트 `src/**` (desktop 프로젝트 무수정)

## Parallel Group

B (Task 01 완료 후, Task 02 와 병렬 실행 가능)
