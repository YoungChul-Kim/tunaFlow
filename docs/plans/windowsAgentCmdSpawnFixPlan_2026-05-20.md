---
title: Windows agents/ spawn 의 batch arg escape 회귀 — gemini/codex/opencode 일괄 fix
status: ready
priority: P0 (Windows 외부 사용자 가시 회귀, v0.1.8-beta-5 hotfix)
created_at: 2026-05-20
---

# 0. Context

외부 사용자 보고 (메신저, 2026-05-20):
```
[gemini error] Failed to spawn gemini (C:\Users\bery5\AppData\Roaming\npm\gemini.cmd): batch file arguments are invalid
```

## Root cause

- Rust `std::process::Command` 가 1.77+ 부터 `.cmd`/`.bat` 파일에 대해 인자 escape 강화 (CVE-2024-24576). 인자에 특수문자 (`"`, `\`, control chars) 가 raw 로 들어가면 `InvalidInput` reject — 메시지 `batch file arguments are invalid`
- PR #278 (`fix(win): agent CLI`) 가 Windows `.cmd`/`.bat` → `cmd /C` wrapping 패턴 도입 — 단 `project_onboarding.rs` / `search/query_expand.rs` / `agent_detect.rs` 영역만. **agents/ 영역 (실제 send 경로) 누락**
- `agents/gemini.rs:49 / :177` + `agents/codex.rs:86 / :262` + `agents/opencode.rs:81` 의 `Command::new(<cmd>)` spawn path 가 raw — Windows + npm 글로벌 `.cmd` wrapper 사용 시 fail
- 일반 send 경로에서 gemini 호출 시 회귀 발생 (외부 보고)

## 누락 영역

| file | line | 영역 |
|---|---|---|
| `agents/gemini.rs` | 49 | streaming spawn (`run_gemini_with_history` 또는 동등) |
| `agents/gemini.rs` | 177 | invocation spawn (별 path) |
| `agents/codex.rs` | 86 | streaming spawn |
| `agents/codex.rs` | 262 | invocation spawn |
| `agents/opencode.rs` | 81 | spawn (사용 안 함 가능, 동일 패턴 보호) |
| `agents/claude.rs` | 407 / 678 | spawn (claude binary 는 `.cmd` wrapper 아닐 가능 — Windows 확인 필요) |

## PR #278 패턴 (재사용 대상)

`project_onboarding.rs:587~613`:
```rust
let is_windows_script = cfg!(target_os = "windows")
    && (lower.ends_with(".cmd") || lower.ends_with(".bat"));
// .cmd / .bat → cmd /C 로 wrapping
// no_console() 적용
```

# 1. Invariants

- **INV-WAS-1**: Windows 환경에서 `.cmd`/`.bat` wrapper 호출 시 `cmd /C` wrapping 으로 batch arg escape 우회
- **INV-WAS-2**: macOS / Linux 동작 변경 0 (`cfg(target_os = "windows")` 분기)
- **INV-WAS-3**: 인자 안 특수문자 (`"`, `\`, `&`, `|`, `<`, `>`) 가 cmd shell 에 의해 의도외 해석 안 되도록 적절한 escape
- **INV-WAS-4**: spawn stdout/stderr drain 및 timeout 동작 보존 (PR #278 의 다른 fix 와 충돌 X)
- **INV-WAS-5**: claude.rs 영역은 `claude` binary (native exe) 가 아닌 `.cmd` wrapper 인 경우만 적용. native exe 면 분기 안 가도록

# 2. Goals / Non-goals

## Goals
- agents/gemini.rs / agents/codex.rs / agents/opencode.rs 의 spawn path 에 `is_windows_script` + `cmd /C` wrapping 적용
- 공통 helper 추출 (`spawn_agent_cmd_windows_safe`) — SSOT 일관성, 향후 회귀 차단
- claude.rs 영역 audit + 필요시 같은 패턴 적용

## Non-goals
- pty/session.rs 변경 (별 path, PTY interactive 영역)
- Tauri command layer 변경
- 인자 자체 escape (cmd /C wrapping 으로 충분)

# 3. Subtasks

## T1 — 공통 helper 추출 (P0)

**파일**: `src-tauri/src/agents/mod.rs` 또는 `src-tauri/src/agents/win_spawn.rs` (신규)

```rust
#[cfg(target_os = "windows")]
pub fn wrap_windows_script(cmd_path: &str, args: &[&str]) -> std::process::Command {
    let lower = cmd_path.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg(cmd_path);
        for a in args { c.arg(a); }
        c
    } else {
        let mut c = std::process::Command::new(cmd_path);
        for a in args { c.arg(a); }
        c
    }
}

#[cfg(not(target_os = "windows"))]
pub fn wrap_windows_script(cmd_path: &str, args: &[&str]) -> std::process::Command {
    let mut c = std::process::Command::new(cmd_path);
    for a in args { c.arg(a); }
    c
}
```

호출 site:
```rust
let mut cmd = wrap_windows_script(&gemini_cmd, &["-p", &prompt, "--model", &model]);
// 후속 cmd.no_console() / stdio() / current_dir() / spawn()
```

## T2 — gemini.rs spawn site 2 곳 적용 (P0)

**파일**: `src-tauri/src/agents/gemini.rs:49, :177`

각 `Command::new(...)` + `.args(...)` 호출을 `wrap_windows_script(...)` 로 교체. 후속 chain (no_console / stderr / stdout / spawn) 동일 유지.

## T3 — codex.rs spawn site 2 곳 적용 (P0)

**파일**: `src-tauri/src/agents/codex.rs:86, :262`

T2 동일 패턴.

## T4 — opencode.rs spawn site 적용 (P1)

**파일**: `src-tauri/src/agents/opencode.rs:81`

opencode 는 현재 사용 안 하지만 동일 회귀 방지 (선제적 fix).

## T5 — claude.rs audit + 조건부 적용 (P1)

**파일**: `src-tauri/src/agents/claude.rs:407, :678`

claude binary 가 Windows 에서 `.cmd` wrapper 형태인지 확인:
- 만약 native `.exe` → 변경 X (분기 어차피 안 감)
- 만약 `.cmd` wrapper → T2 동일 적용

`resolve_claude_binary()` (`src-tauri/src/commands/model_discovery.rs:196`) 결과의 path extension 확인.

## T6 — 검증 + 회귀 가드 (P0)

- Windows 환경 실측 (사용자 영역) — gemini.cmd / codex.cmd 호출 시 성공
- macOS / Linux 영향 0 (`cfg(target_os = "windows")` 분기)
- Rust unit test — `wrap_windows_script` 가 `.cmd`/`.bat` → cmd /C 분기, 다른 확장자 → direct spawn
- `cargo test --lib` baseline 회귀 0

# 4. Cross-cutting risks

- `cmd /C` wrapping 시 stdin/stdout/stderr 처리 차이 — Rust Command 의 stdio 설정이 cmd /C wrapper 와 직접 spawn 사이에 동등하게 동작하는지 확인. PR #278 의 onboarding 영역에서 이미 검증됨
- `no_console()` flag 적용 위치 — wrap helper 안에서 적용 또는 호출 site 에서. 일관성
- claude.cmd 처리 — Windows 환경에서 Claude CLI 가 `.cmd` 형태로 설치되는지 확인 필요 (Anthropic 공식 installer 패턴)

# 5. Rollback

T1~T6 별 commit 분리. 각 revert 가능. cfg(target_os = "windows") 분기라 macOS / Linux 회귀 0 — Windows 한정 hotfix.

# 6. 다음 step

1. Developer 핸드오프 작성 — `docs/prompts/windowsAgentCmdSpawnFixDeveloperHandoff_2026-05-20.md`
2. Developer subagent dispatch (worktree 격리, admin merge)
3. 머지 후 CHANGELOG + 매니페스트 bump (v0.1.8-beta-5)
4. tag push → Draft release publish → 외부 사용자 메신저 답변
