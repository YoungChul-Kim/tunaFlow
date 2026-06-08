//! Windows `.cmd`/`.bat` spawn wrapper — `std::process::Command` SSOT.
//!
//! ## 배경
//! Rust 1.77+ 부터 `std::process::Command` 가 `.cmd`/`.bat` 파일을 직접 spawn
//! 할 때 인자에 raw 특수문자 (`"`, `\`, 제어문자 등) 가 포함되면 batch arg
//! escape 강화 (CVE-2024-24576) 로 `InvalidInput` reject 한다 — 메시지
//! `batch file arguments are invalid`.
//!
//! npm 글로벌 CLI (gemini / codex / claude / opencode 등) 는 Windows 에서
//! `%APPDATA%\npm\<name>.cmd` wrapper 형태로 설치되므로, `Command::new` 가
//! 그 path 를 직접 spawn 시 위 회귀 발생.
//!
//! ## 해법
//! PR #278 (`commands/project_onboarding.rs:587~613`) 가 onboarding 영역에
//! 도입한 패턴: `.cmd` / `.bat` 은 `cmd /C <path>` 로 wrapping 해 batch arg
//! 검사를 cmd.exe 가 자체 처리하도록 위임. agents/ 영역에 같은 패턴을
//! SSOT helper 로 추출.
//!
//! ## 시그니처 선택
//! `&str path + &[&str] args` 형태로 받아 native `std::process::Command`
//! 반환. 호출 site 는 그 후 `.no_console()` / `.stdin()` / `.stdout()` /
//! `.stderr()` / `.current_dir()` / `.spawn()` chain 을 그대로 유지한다.
//! 추가 args 가 동적 (model 조건부, image_paths 등) 인 호출 site 도 반환된
//! Command 에 `.arg(...)` 를 이어 붙이면 된다.

use std::process::Command;

/// `.cmd` / `.bat` 파일이면 `cmd /C` 로 wrapping, 그 외는 직접 spawn.
/// macOS / Linux 에선 항상 직접 spawn (cfg 분기).
///
/// `args` 는 path 다음에 forward 되는 초기 인자 (예: node script path).
/// 후속 인자는 호출 site 에서 반환된 Command 에 `.arg(...)` 로 chain.
pub fn wrap_windows_script(cmd_path: &str, args: &[&str]) -> Command {
    #[cfg(target_os = "windows")]
    {
        let lower = cmd_path.to_ascii_lowercase();
        if lower.ends_with(".cmd") || lower.ends_with(".bat") {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(cmd_path);
            for a in args {
                c.arg(a);
            }
            return c;
        }
    }
    let mut c = Command::new(cmd_path);
    for a in args {
        c.arg(a);
    }
    c
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn non_script_path_returns_direct_command() {
        // `.exe` / no-extension 은 plain wrapping 없이 직접 spawn.
        // get_program() 으로 program 비교 — Windows 에선 .cmd 만 cmd /C 분기.
        let cmd = wrap_windows_script("gemini", &["-p", "hello"]);
        // bare name → 직접 spawn (cfg 가 windows 이면 .cmd 가 아니므로 직접)
        let program = cmd.get_program().to_string_lossy().into_owned();
        #[cfg(not(target_os = "windows"))]
        assert_eq!(program, "gemini");
        #[cfg(target_os = "windows")]
        assert_eq!(program, "gemini");
    }

    #[test]
    fn exe_path_returns_direct_command() {
        let cmd = wrap_windows_script("C:\\path\\to\\binary.exe", &[]);
        let program = cmd.get_program().to_string_lossy().into_owned();
        // `.exe` 는 batch 아니므로 직접 spawn.
        assert!(program.ends_with("binary.exe"));
    }

    #[test]
    fn cmd_extension_is_handled() {
        let cmd = wrap_windows_script("C:\\Users\\u\\AppData\\Roaming\\npm\\gemini.cmd", &["-p", "x"]);
        let program = cmd.get_program().to_string_lossy().into_owned();
        let args: Vec<String> = cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect();

        #[cfg(target_os = "windows")]
        {
            // Windows: cmd /C <path> 분기. program == "cmd", 첫 args == "/C", 두번째 == 원 path.
            assert_eq!(program, "cmd");
            assert_eq!(args[0], "/C");
            assert!(args[1].ends_with("gemini.cmd"));
            assert_eq!(args[2], "-p");
            assert_eq!(args[3], "x");
        }
        #[cfg(not(target_os = "windows"))]
        {
            // macOS / Linux: cfg 분기 안 가서 직접 spawn (실제 호출은 거의 없지만 helper 동작 안정성 검증).
            assert!(program.ends_with("gemini.cmd"));
            assert_eq!(args, vec!["-p", "x"]);
        }
    }

    #[test]
    fn bat_extension_case_insensitive() {
        let cmd = wrap_windows_script("D:\\tools\\foo.BAT", &[]);
        let program = cmd.get_program().to_string_lossy().into_owned();

        #[cfg(target_os = "windows")]
        {
            // `.BAT` 대문자도 case-insensitive 비교로 wrapping.
            assert_eq!(program, "cmd");
        }
        #[cfg(not(target_os = "windows"))]
        {
            assert!(program.ends_with("foo.BAT"));
        }
    }
}
