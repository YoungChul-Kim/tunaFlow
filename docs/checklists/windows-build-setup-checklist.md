# Windows Build Setup Checklist

`tunaFlow`를 Windows에서 직접 빌드하거나 `tauri dev`로 실행하기 위한 체크리스트다.

대상 환경:
- Windows 10 21H2 이상
- x64
- PowerShell

## 1. 필수 설치

- [ ] `Git` 설치
  ```powershell
  winget install Git.Git
  ```

- [ ] `Node.js 22` 계열 설치
  - 이 작업공간 기준 확인 버전: `node v22.17.1`, `npm 11.5.2`
  ```powershell
  winget install OpenJS.NodeJS
  ```

- [ ] `Rust stable` + `cargo` 설치
  - 현재 이 작업공간에서는 `rustc`, `cargo`가 없음
  ```powershell
  winget install Rustlang.Rustup
  rustup default stable
  ```

- [ ] `Visual Studio Build Tools 2022` 설치
  - `Desktop development with C++` 워크로드 포함
  - Rust MSVC 타깃과 Tauri Windows 빌드에 필요

- [ ] `Microsoft Edge WebView2 Runtime` 설치
  - Tauri 앱 실행에 필요
  ```powershell
  winget install Microsoft.EdgeWebView2Runtime
  ```

- [ ] 에이전트 CLI 최소 1개 이상 설치
  ```powershell
  npm install -g @anthropic-ai/claude-code
  npm install -g @openai/codex
  npm install -g @google/gemini-cli
  ```

## 2. 선택 설치

- [ ] `Python 3.11+`
  - `code-review-graph` 같은 추가 sidecar를 직접 준비하거나 확장 기능까지 맞출 때 유용
  ```powershell
  winget install Python.Python.3.11
  ```

## 3. 저장소 준비

- [ ] 저장소 클론
  ```powershell
  git clone https://github.com/hang-in/tunaFlow.git
  cd tunaFlow
  ```

- [ ] 프론트엔드 의존성 설치
  ```powershell
  npm install
  ```

## 4. 버전 확인

- [ ] 아래 명령이 모두 정상 출력되는지 확인
  ```powershell
  node --version
  npm --version
  rustc --version
  cargo --version
  npx tauri --version
  ```

## 5. 개발 실행

- [ ] 개발 모드 실행
  ```powershell
  npm run tauri dev
  ```

## 6. 이 저장소 기준 특이사항

- [ ] `rawq` sidecar 준비 여부 확인
  - 현재 저장소에는 `src-tauri/binaries/` 디렉터리가 없음
  - 현재 저장소에는 `vendor/` 디렉터리도 없음
  - 즉, `rawq` 바이너리 또는 소스가 별도로 준비되지 않으면 일부 기능 또는 릴리스 빌드가 막힐 수 있음

- [ ] `scripts/build-rawq.ps1` 사용 전 `RAWQ_SRC` 또는 vendor 소스 경로 준비
  ```powershell
  $env:RAWQ_SRC="C:\path\to\rawq"
  .\scripts\build-rawq.ps1
  ```

- [ ] `rawq` 없이도 실행은 되는지 확인하되, 코드 검색 관련 기능은 제약 가능성을 감안
  - 문서와 계획 파일 기준으로 `rawq`는 사실상 핵심 sidecar 의존성에 가깝다
  - 앱이 떠도 검색/인덱싱/컨텍스트 관련 기능은 정상 동작하지 않을 수 있다

## 7. 빌드 전 최종 체크

- [ ] `npm install` 완료
- [ ] `rustc`, `cargo` 정상 인식
- [ ] `WebView2 Runtime` 설치 완료
- [ ] 사용할 에이전트 CLI 로그인/초기 설정 완료
- [ ] `rawq` source 또는 바이너리 준비 여부 확인

## 8. 문제 발생 시 우선 확인

- [ ] `cargo` 관련 오류가 나면 Rust 설치와 새 터미널 재실행부터 확인
- [ ] 링크/컴파일 오류가 나면 Visual Studio Build Tools의 C++ 워크로드 설치 여부 확인
- [ ] 앱 창이 뜨지 않으면 WebView2 Runtime 설치 여부 확인
- [ ] 검색/인덱싱 기능이 비정상이면 `rawq` sidecar 준비 상태부터 확인
