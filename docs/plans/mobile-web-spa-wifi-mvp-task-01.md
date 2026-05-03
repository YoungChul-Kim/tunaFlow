# Task 01 — mobile-spa 프로젝트 스캐폴딩

## Changed files

| 경로 | 상태 |
|------|------|
| `mobile-spa/package.json` | 신규 또는 검증/보완 (선행분 존재) |
| `mobile-spa/vite.config.ts` | 신규 또는 검증/보완 |
| `mobile-spa/tsconfig.json` | 신규 또는 검증/보완 |
| `mobile-spa/index.html` | 신규 또는 검증/보완 |
| `mobile-spa/src/main.tsx` | 신규 또는 검증/보완 |
| `mobile-spa/src/App.tsx` | 신규 또는 검증/보완 (Task 03 페이지 import 전 stub) |
| `mobile-spa/src/index.css` | 신규 또는 검증/보완 |

> 선행 진척: `mobile-spa/` 일부 파일이 이미 존재한다. 본 task는 본 명세와의 일치 여부 검증과 갭 보완에 한정한다 — 기존 mock 페이지(`pages/*`, `components/*`, `lib/mock.ts`, `lib/time.ts`)는 Task 03 영역이므로 손대지 않는다.

## Change description

`mobile-spa/` 디렉토리에 독립 Vite + React 프로젝트를 보장한다. Tauri 의존성 없이 순수 웹 앱으로 동작한다.

### 1. package.json 핵심 의존성

```json
{
  "name": "tunaflow-mobile",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "lucide-react": "^0.400.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.3",
    "vite": "^5.4.2",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```

`react-markdown`, `remark-gfm` 은 Task 03에서 추가하므로 본 task에서는 미포함이어도 무방.

### 2. vite.config.ts

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/mobile/',
  build: {
    outDir: '../src-tauri/resources/mobile-spa',
    emptyOutDir: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

`base: '/mobile/'` — axum의 `/mobile/` 경로에서 서빙되므로 asset 접두사 필수.
`outDir` — Tauri 리소스 디렉토리로 직접 빌드. Task 04에서 axum이 이 경로를 서빙한다.

### 3. tsconfig.json

루트 `tsconfig.json`과 동일한 strict 설정 + `paths: { "@/*": ["./src/*"] }`. Task 03의 react-markdown 도입을 고려해 `"jsx": "react-jsx"`, `"moduleResolution": "Bundler"`로 둔다.

### 4. src/main.tsx

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/mobile">
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
```

`basename="/mobile"` — axum 서빙 경로와 일치.

### 5. src/App.tsx (stub — Task 03가 실제 페이지로 교체)

기존 선행분이 이미 페이지 import 형태일 수 있으나 본 task에서는 빌드/타입체크만 통과하면 됨. 라우터 골격은 Task 03 명세에 위임.

### 6. src/index.css

Tailwind v4:
```css
@import "tailwindcss";
```

## Dependencies

없음 (첫 번째 태스크).

## Verification

```bash
# 1. 의존성 설치 (이미 있으면 빠르게 통과)
cd mobile-spa && npm install

# 2. TypeScript 타입 체크 — 0 error
cd mobile-spa && npx tsc --noEmit

# 3. 빌드 성공 — outDir 산출물 생성
cd mobile-spa && npm run build

# 4. outDir 결과 확인 (Windows PowerShell)
Test-Path ../src-tauri/resources/mobile-spa/index.html
# 또는 (POSIX)
test -f ../src-tauri/resources/mobile-spa/index.html && echo OK
```

## Risks

- `outDir`이 `src-tauri/resources/mobile-spa`이므로 `cargo clean` 시 삭제될 수 있음. Task 04에서 빌드 순서(`mobile-spa/build` → `tauri build`)를 README에 명시 권장.
- `base: '/mobile/'` 누락 시 asset 경로 404. `npm run dev` 시 `http://localhost:5173/mobile/`로 접근해야 함.
- 선행 mock 페이지가 Task 02 산출물(`lib/api/*`)을 import 하고 있으면 본 task의 빌드/타입체크 단계에서 모듈 미존재 에러 발생 가능 → 그 경우 Task 03 페이지의 import를 일시적으로 mock 만 가리키도록 두는 것이 본 task의 verification 통과 조건.

## Scope boundary (수정 금지)

- `mobile-spa/src/pages/**` — Task 03 영역
- `mobile-spa/src/components/**` — Task 03 영역
- `mobile-spa/src/lib/api/**` — Task 02 영역
- `mobile-spa/src/lib/connect.ts` — Task 02 영역
- `src-tauri/**` — Task 04 영역
- 루트 `src/**`, `package.json` (desktop 프로젝트 무수정 원칙)

## Parallel Group

A (의존성 없음, 첫 번째 실행)
