---
title: Developer 핸드오프 — Windows agents/ spawn batch arg escape fix
plan: docs/plans/windowsAgentCmdSpawnFixPlan_2026-05-20.md
created_at: 2026-05-20
---

# 0. 한 줄 요약

Windows 외부 사용자 보고: `Failed to spawn gemini (...gemini.cmd): batch file arguments are invalid`. PR #278 의 `.cmd`/`.bat` → `cmd /C` wrapping 패턴이 `agents/` 영역 (gemini.rs / codex.rs / opencode.rs / claude.rs?) 에 누락. v0.1.8-beta-5 hotfix.

# 1. SSOT
- **Plan**: `docs/plans/windowsAgentCmdSpawnFixPlan_2026-05-20.md` (§3 T1~T6)
- **PR #278 패턴 참고**: `src-tauri/src/commands/project_onboarding.rs:587~613` (`is_windows_script` + `cmd /C` 분기)

# 2. PR 전략 — 단일 PR

브랜치: `fix/windows-agent-cmd-spawn`

6 commit:
- `feat(agents): wrap_windows_script helper (T1)`
- `fix(gemini): wrap .cmd with cmd /C on Windows (T2)`
- `fix(codex): wrap .cmd with cmd /C on Windows (T3)`
- `fix(opencode): wrap .cmd with cmd /C on Windows (preemptive, T4)`
- `chore(claude): audit binary path extension, apply if .cmd (T5)`
- `test(agents): wrap_windows_script unit test (T6)`

각 trailer:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

# 3. 작업 순서

T1 (helper) → T2/T3/T4 (호출 site 적용, 영역 다름 → 순서 무관) → T5 (claude audit) → T6 (test)

# 4. DO

1. `cfg(target_os = "windows")` 분기 엄격 — macOS / Linux 변경 0
2. helper 위치는 `src-tauri/src/agents/mod.rs` 또는 신규 `src-tauri/src/agents/win_spawn.rs` (선택, 본인 판단)
3. `.cmd` / `.bat` 확장자 case-insensitive 비교 (`to_ascii_lowercase`)
4. helper 가 native `Command` 객체 반환 — 호출 site 에서 `.no_console()` / `.stderr()` / `.stdout()` / `.current_dir()` / `.spawn()` 동일 chain 유지
5. claude.rs 영역 (T5): `resolve_claude_binary()` 결과의 path extension 확인. native `.exe` 면 분기 안 가서 변경 X (실측 후 결정)
6. T6 unit test: `.cmd` / `.bat` / `.exe` / no-extension 4 케이스 cover

# 5. DO NOT

- ❌ macOS / Linux path 변경 (cfg 분기 외 동작 변경 0)
- ❌ pty/session.rs 변경 (별 path)
- ❌ Tauri command layer (commands/agents.rs 등) 변경
- ❌ 인자 자체 escape (cmd /C wrapping 으로 충분)
- ❌ helper 의 signature 변경 (호출 site 가 같은 형태 — &str path + &[&str] args)
- ❌ 새 dependency
- ❌ PR #278 의 onboarding 영역 (`project_onboarding.rs`) 변경 — 이미 fix 됨, 본 PR 비대상

# 6. Verification

```bash
cd src-tauri && cargo check --message-format=short
cd src-tauri && cargo test --lib                       # baseline 652 + T6 +4 (cases)
npx tsc --noEmit
npx vitest run                                          # baseline 478 동일 (frontend 변경 0)
```

회귀 grep:
```bash
git diff src/                                          # 변경 0 (frontend)
git diff src-tauri/src/commands/project_onboarding.rs  # 변경 0 (PR #278 영역)
git diff src-tauri/src/commands/pty/session.rs         # 변경 0 (별 path)
rg "wrap_windows_script" src-tauri/src/                # helper 정의 + 호출 site 모두 매칭
rg "Command::new\(.*cmd\)" src-tauri/src/agents/        # cmd /C wrapping 안 거치는 spawn 없는지
```

# 7. e2e 수동 검증 (사용자 영역 위임)

자동 검증은 `cargo test --lib` 의 helper unit test 4 케이스. Windows 환경 실측:
- v0.1.8-beta-5 publish 후 외부 사용자 (bery5) 가 `gemini.cmd` 호출 정상 — 메신저 회신 확인
- 같은 환경에서 codex.cmd / claude.cmd 도 정상

PR description 의 test plan 에 unchecked 명시 → release 후 사용자 검증.

# 8. CI 정책

PR + **CI watch** 권장 — macOS + Windows + eval 모두 SUCCESS 후 머지. cross-platform 회귀 영역이라 admin merge 회피.

# 9. 보고 포맷 (chat)

```
## Windows Agent .cmd Spawn Fix 결과
- PR URL + 머지 commit
- task 별 변경 라인 수 + 핵심 파일
- §6 Verification: cargo check / cargo test 결과 (baseline + T6 +N)
- §7 e2e — Windows 사용자 영역 명시
- 회귀 가드 grep (frontend 변경 0 / onboarding 변경 0 / pty 변경 0)
- T5 audit 결과 (claude binary extension 분기 적용 여부)
- T1 helper 위치 (agents/mod.rs vs agents/win_spawn.rs)
```

# 10. 막히면 (escalate)

- `cmd /C` wrapping 시 stdout/stderr drain 동작이 PR #278 의 onboarding 영역과 다르게 동작 → 가설 + grep 결과 보고
- claude binary 가 `.cmd` 형태 (Anthropic Windows installer 패턴) 인 경우 T5 적용 — `resolve_claude_binary()` 의 path 추적
- `no_console()` flag 적용 위치 (helper 안 vs 호출 site) 결정
- Rust `Command::new("cmd").arg("/C").arg(path).args(...)` 의 spawn 후 wait / kill 동작이 직접 spawn 과 호환되는지 — Windows runner CI 로 검증

# 11. Worktree 안전 가드

- macOS APFS case-insensitive: Edit 절대 경로 sanity check
- `git rev-parse --abbrev-ref HEAD` commit 직전
- main repo 변경 발견 시 `git checkout HEAD -- <path>`
- git stash drop/pop X

# 12. 주의사항

- autonomous — 사용자 질문 금지 (위 escalate 외)
- 한국어 commit / chat 보고
- 핸드오프 / plan SSOT
- 머지 후 v0.1.8-beta-5 release tag push 진행은 Architect 영역 (CHANGELOG / 매니페스트 bump 포함)
