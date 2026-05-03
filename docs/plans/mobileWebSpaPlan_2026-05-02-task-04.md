# Task 04 — axum Static 서빙 추가

## Changed files

| 경로 | 상태 |
|------|------|
| `src-tauri/Cargo.toml` | 수정: `tower-http` features에 `"fs"` 추가 |
| `src-tauri/src/http_api/mod.rs` | 수정: `/mobile/` ServeDir 라우트 추가 |
| `src-tauri/tauri.conf.json` | 수정: `bundle.resources` 섹션 추가 |

## Change description

axum 서버가 `/mobile/` 경로에서 모바일 SPA의 빌드 결과물을 정적으로 서빙하도록 한다.

---

### 1. Cargo.toml — tower-http `fs` feature 추가

현재:
```toml
tower-http = { version = "0.6", features = ["cors"] }
```

변경 후:
```toml
tower-http = { version = "0.6", features = ["cors", "fs"] }
```

`ServeDir`과 `ServeFile`이 `fs` feature에 포함되어 있다.

---

### 2. mod.rs — ServeDir 라우트 추가

**추가할 import** (파일 상단):
```rust
use tower_http::services::{ServeDir, ServeFile};
```

**`start_server` 함수 내 resource 경로 계산** (라우터 구성 전):
```rust
let mobile_spa_dir = app_handle
    .path()
    .resource_dir()
    .map(|p| p.join("mobile-spa"))
    .unwrap_or_else(|_| std::path::PathBuf::from("resources/mobile-spa"));
```

**`build_router` 함수 시그니처 변경**: `mobile_spa_dir: std::path::PathBuf` 파라미터 추가.

**라우터에 ServeDir 추가** (`build_router` 내):
```rust
// /mobile/ 경로에 SPA static 서빙
// SPA 라우팅을 위해 알 수 없는 경로는 index.html로 fallback
let mobile_service = ServeDir::new(&mobile_spa_dir)
    .fallback(ServeFile::new(mobile_spa_dir.join("index.html")));

Router::new()
    // ... 기존 API 라우트들 ...
    .nest_service("/mobile", mobile_service)
```

`ServeDir::fallback(ServeFile)` — `/mobile/conversations` 같은 SPA 클라이언트 라우트에서 새로고침 시 index.html을 반환해 React Router가 처리하도록 한다.

**주의**: `/mobile` (슬래시 없음)로 접근 시 `/mobile/`로 301 redirect가 자동으로 처리됨.

---

### 3. tauri.conf.json — resources 등록

`bundle` 섹션에 `resources` 추가:
```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "resources": {
      "resources/mobile-spa/**/*": "mobile-spa/"
    }
  }
}
```

이 설정으로 `tauri build` 시 `src-tauri/resources/mobile-spa/`의 내용이 앱 번들에 포함되어, `app_handle.path().resource_dir()`로 접근 가능해진다.

**개발 모드(`tauri dev`) 주의**: 개발 중에는 resource_dir이 다를 수 있으므로 `mobile_spa_dir` 존재 여부를 확인하고, 없으면 `/mobile/` 라우트를 비활성화하거나 404를 반환한다.

```rust
let mobile_spa_dir = app_handle
    .path()
    .resource_dir()
    .map(|p| p.join("mobile-spa"))
    .unwrap_or_else(|_| std::path::PathBuf::from("resources/mobile-spa"));

// 개발 환경에서 빌드 안 된 경우 대비
if !mobile_spa_dir.exists() {
    eprintln!("[http_api] mobile-spa not found at {:?} — /mobile/ disabled", mobile_spa_dir);
}
```

---

### 빌드 순서 안내 (CLAUDE.md 또는 README에 추가 권장)

```bash
# 1. 모바일 SPA 빌드
cd mobile-spa && npm run build
# → src-tauri/resources/mobile-spa/ 생성됨

# 2. Tauri 빌드
npm run tauri build
```

## Dependencies

Task 01 완료 후 시작 (빌드 결과물 경로 `src-tauri/resources/mobile-spa` 필요).
Task 02, 03과 병렬 실행 가능.

## Verification

```bash
# 1. Rust 컴파일 체크
cd src-tauri && cargo check
# → error 없이 완료

# 2. 앱 실행 후 mobile-spa 빌드 확인 (Task 01 또는 03 완료 후)
cd mobile-spa && npm run build

# 3. Manual: 앱 실행 (npm run tauri dev) 후
#    브라우저에서 http://localhost:19840/mobile/ 접속
#    → ConnectPage HTML 반환 확인 (React 앱 로드)

# 4. Manual: http://localhost:19840/mobile/conversations 접속
#    → SPA fallback: index.html 반환 후 React Router가 /conversations 처리 확인
```

## Risks

- `app_handle.path().resource_dir()` — Tauri 2에서 `tauri::Manager` trait import 필요. `use tauri::Manager;` 추가해야 한다.
- `tauri dev` 중에는 resource_dir이 `src-tauri/` 기준이 아닐 수 있음. 개발 시 `mobile_spa_dir.exists()` 체크로 graceful 처리 필요.
- `ServeDir`이 인증 미들웨어를 bypass함 — `/mobile/` 경로는 공개 접근이 목적이므로 의도된 동작. token은 ConnectPage에서 사용자가 직접 입력.
- `resources/mobile-spa/**/*` glob이 Tauri 2 `tauri.conf.json`에서 동작하지 않을 수 있음 — 공식 문서 기준 `"resources/mobile-spa"` 단순 경로 지정 방식으로 대체 가능.

## Parallel Group

B (Task 01 완료 후, Task 02와 병렬 실행 가능)
