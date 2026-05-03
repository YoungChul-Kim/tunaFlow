# Task 01 — mobile-spa 프로젝트 스캐폴딩

## Changed files

| 경로 | 상태 |
|------|------|
| `mobile-spa/package.json` | 신규 |
| `mobile-spa/vite.config.ts` | 신규 |
| `mobile-spa/tsconfig.json` | 신규 |
| `mobile-spa/index.html` | 신규 |
| `mobile-spa/src/main.tsx` | 신규 |
| `mobile-spa/src/App.tsx` | 신규 (stub — 라우터 + 빈 페이지) |

## Change description

`mobile-spa/` 디렉토리에 독립 Vite + React 프로젝트를 생성한다.
Tauri 의존성 없이 순수 웹 앱으로 동작한다.

### package.json 핵심 의존성

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

### vite.config.ts

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

`base: '/mobile/'` — axum의 `/mobile/` 경로에서 서빙되므로 asset 경로 접두사 필요.
`outDir` — Tauri 리소스 디렉토리로 직접 빌드. Task 04에서 axum이 이 경로를 서빙한다.

### tsconfig.json

기존 루트 `tsconfig.json`과 동일한 strict 설정, `paths: { "@/*": ["./src/*"] }`.

### src/main.tsx

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

`basename="/mobile"` — axum 서빙 경로와 일치시킨다.

### src/App.tsx (stub)

```tsx
import { Routes, Route, Navigate } from 'react-router-dom'

export default function App() {
  return (
    <Routes>
      <Route path="/connect" element={<div>Connect</div>} />
      <Route path="/conversations" element={<div>Conversations</div>} />
      <Route path="/conversations/:id" element={<div>Chat</div>} />
      <Route path="/plans" element={<div>Plans</div>} />
      <Route path="*" element={<Navigate to="/connect" replace />} />
    </Routes>
  )
}
```

실제 페이지 컴포넌트는 Task 03에서 구현.

### src/index.css

Tailwind v4 directives:
```css
@import "tailwindcss";
```

## Dependencies

없음 (첫 번째 태스크).

## Verification

```bash
# 1. 의존성 설치
cd mobile-spa && npm install

# 2. TypeScript 타입 체크 (stub 상태에서 에러 없어야 함)
cd mobile-spa && npx tsc --noEmit

# 3. 개발 서버 시작 확인 (Ctrl+C로 종료)
cd mobile-spa && npm run dev
# → "Local: http://localhost:5173/mobile/" 출력 확인

# 4. 빌드 확인
cd mobile-spa && npm run build
# → src-tauri/resources/mobile-spa/ 디렉토리 생성 확인
ls ../src-tauri/resources/mobile-spa/
```

## Risks

- `outDir`이 `src-tauri/resources/mobile-spa`이므로 `cargo clean` 시 삭제될 수 있음. `tauri build` 스크립트에 mobile-spa 빌드 선행 단계 추가 권장 (이번 태스크 범위 외).
- `base: '/mobile/'`를 잘못 설정하면 asset 경로 404. `npm run dev` 시 `http://localhost:5173/mobile/`로 접근해야 함.

## Parallel Group

A (의존성 없음, 첫 번째 실행)
