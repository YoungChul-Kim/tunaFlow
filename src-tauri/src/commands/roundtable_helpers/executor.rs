//! RT execution core — dispatch to sequential/deliberative, stream participant runs.

use tauri::Emitter;

use crate::agents::{claude, codex, gemini, openai_compat, opencode};
use crate::db::models::Message;
use crate::db::DbState;
use crate::errors::AppError;
use crate::CancelRegistry;

pub use super::types::{
    RtParticipantStatus, RoundtableParticipant, RtChunkPayload,
    ParticipantResult, RoundStrategy, SessionMap,
    participant_identity, effective_max_tokens, output_cap_directive,
};
pub use super::context::{RtContextCache, RtVectorIndex};

/// Budget settings for local models (ollama, opencode) — smaller context window.
#[allow(dead_code)]
const LOCAL_MODE: &str = "lite";
#[allow(dead_code)]
const LOCAL_BUDGET_CAP: usize = 15_000;

/// Run a single participant against a prompt. No DB lock held.
/// Retained for non-streaming fallback (opencode).
#[allow(dead_code)]
pub async fn run_participant(
    p: &RoundtableParticipant,
    prompt: String,
    sources_json: String,
    project_path: Option<String>,
) -> ParticipantResult {
    let engine_key = p.engine.as_deref().unwrap_or("claude");
    let max_tok = effective_max_tokens(p);
    eprintln!("[rt] running participant={} engine={} role={:?} max_tokens={:?}", p.name, engine_key, p.role, max_tok);

    let prompt = format!("{}{}", output_cap_directive(max_tok), prompt);

    let run_input = claude::RunInput {
        prompt,
        model: p.model.clone(),
        system_prompt: None,
        resume_token: None,
        project_path, image_paths: Vec::new(),
    };

    let engine_key_owned = engine_key.to_string();
    let result = tokio::task::spawn_blocking(move || -> (Result<crate::agents::claude::RunOutput, AppError>, &'static str) {
        match engine_key_owned.as_str() {
            "claude" => (claude::run(run_input), "claude-code"),
            "codex" => (codex::run(run_input), "codex"),
            "gemini" => (gemini::run(run_input), "gemini"),
            "opencode" => (opencode::run(run_input), "opencode"),
            "ollama" => (openai_compat::run(run_input), "ollama"),
            // vllm: openai_compat::run() hardcodes ollama_base_url() → must
            // route through stream_run_with_base() with vllm_base_url() so the
            // request reaches the vLLM server (localhost:8000) instead of
            // localhost:11434. spawn_blocking 안의 sync 컨텍스트라 tokio
            // current-thread handle 로 block_on 한다.
            "vllm" => {
                // Handle::current() 는 non-Tokio context 시 panic. try_current()
                // 으로 graceful 처리 — commands/agents.rs 의 vllm eval 패턴과
                // 일관 (PR #297 T5).
                let res = match tokio::runtime::Handle::try_current() {
                    Ok(rt) => rt.block_on(async {
                        openai_compat::stream_run_with_base(
                            run_input,
                            openai_compat::vllm_base_url(),
                            |_: String| {},
                            |_: String| {},
                        ).await
                    }),
                    Err(_) => Err(AppError::Agent(
                        "No tokio runtime available for vllm participant".into(),
                    )),
                };
                (res, "vllm")
            }
            _ => (
                Err(AppError::Agent(format!("unsupported engine: {}", engine_key_owned))),
                "unknown",
            ),
        }
    })
    .await
    .unwrap_or_else(|_| (Err(AppError::Agent("participant task panicked".into())), "unknown"));

    let (run_result, engine_label) = result;
    match run_result {
        Ok(out) => ParticipantResult {
            name: p.name.clone(),
            engine: engine_label.to_string(),
            model: p.model.clone(),
            content: out.content,
            status: "done".into(),
            cost_usd: out.cost_usd,
            in_tokens: out.input_tokens,
            out_tokens: out.output_tokens,
            prompt_sources: sources_json,
            blind: p.blind,
            session_id: out.session_id,
        },
        Err(e) => ParticipantResult {
            name: p.name.clone(),
            engine: engine_label.to_string(),
            model: p.model.clone(),
            content: format!("Error: {}", e),
            status: "error".into(),
            cost_usd: 0.0,
            in_tokens: 0,
            out_tokens: 0,
            prompt_sources: sources_json,
            blind: p.blind,
            session_id: None,
        },
    }
}

/// Run a single participant with real-time streaming. Emits `roundtable:chunk` events
/// as text arrives. Falls back to `run()` for engines without `stream_run()` (opencode).
pub(super) async fn stream_participant(
    p: &RoundtableParticipant,
    prompt: String,
    sources_json: String,
    project_path: Option<String>,
    msg_id: String,
    conversation_id: String,
    app: tauri::AppHandle,
    cancel_arc: std::sync::Arc<parking_lot::Mutex<std::collections::HashSet<String>>>,
    resume_token: Option<String>,
) -> ParticipantResult {
    let engine_key = p.engine.as_deref().unwrap_or("claude");
    let max_tok = effective_max_tokens(p);
    if resume_token.is_some() {
        eprintln!("[rt-stream] participant={} engine={} resume_token=yes", p.name, engine_key);
    }

    let prompt = format!("{}{}", output_cap_directive(max_tok), prompt);
    let run_input = claude::RunInput {
        prompt,
        model: p.model.clone(),
        system_prompt: None,
        resume_token,
        project_path, image_paths: Vec::new(),
    };

    let name = p.name.clone();
    let model = p.model.clone();
    let blind = p.blind;
    let engine_key_owned = engine_key.to_string();

    let result: (Result<claude::RunOutput, AppError>, &'static str) = match engine_key {
        "claude" | "gemini" => {
            let a = app.clone(); let mi = msg_id.clone(); let ci = conversation_id.clone();
            let ca = std::sync::Arc::clone(&cancel_arc);
            let ci2 = conversation_id.clone();
            let is_claude = engine_key == "claude";
            tokio::task::spawn_blocking(move || {
                let on_chunk = {
                    let a = a.clone(); let mi = mi.clone(); let ci = ci.clone();
                    move |text: String| {
                        let _ = a.emit("roundtable:chunk", RtChunkPayload {
                            message_id: mi.clone(), conversation_id: ci.clone(), text,
                        });
                    }
                };
                let on_progress = |_: String| {};
                let is_cancelled = move || ca.lock().contains(&ci2);
                if is_claude {
                    (claude::stream_run(run_input, on_progress, on_chunk, is_cancelled), "claude-code")
                } else {
                    (gemini::stream_run(run_input, on_progress, on_chunk, is_cancelled), "gemini")
                }
            })
            .await
            .unwrap_or_else(|_| (Err(AppError::Agent("participant task panicked".into())), "unknown"))
        }
        "codex" => {
            let a = app.clone(); let mi = msg_id.clone(); let ci = conversation_id.clone();
            tokio::task::spawn_blocking(move || {
                let on_chunk = {
                    let a = a.clone(); let mi = mi.clone(); let ci = ci.clone();
                    move |text: &str| {
                        let _ = a.emit("roundtable:chunk", RtChunkPayload {
                            message_id: mi.clone(), conversation_id: ci.clone(), text: text.to_string(),
                        });
                    }
                };
                let on_progress = |_: &str| {};
                (codex::stream_run(run_input, on_progress, on_chunk), "codex")
            })
            .await
            .unwrap_or_else(|_| (Err(AppError::Agent("participant task panicked".into())), "unknown"))
        }
        "ollama" | "vllm" => {
            let a = app.clone(); let mi = msg_id.clone(); let ci = conversation_id.clone();
            let on_chunk = {
                let a = a.clone(); let mi = mi.clone(); let ci = ci.clone();
                move |text: String| {
                    let _ = a.emit("roundtable:chunk", RtChunkPayload {
                        message_id: mi.clone(), conversation_id: ci.clone(), text,
                    });
                }
            };
            let on_progress = |_: String| {};
            // openai_compat::stream_run() defaults to ollama_base_url(). For
            // vLLM we must inject vllm_base_url() via stream_run_with_base() —
            // otherwise the request routes to localhost:11434 (ollama).
            let (label, base) = if engine_key_owned == "vllm" {
                ("vllm", openai_compat::vllm_base_url())
            } else {
                ("ollama", std::env::var("OLLAMA_HOST")
                    .unwrap_or_else(|_| "http://localhost:11434".into()))
            };
            (
                openai_compat::stream_run_with_base(run_input, base, on_progress, on_chunk).await,
                label,
            )
        }
        "opencode" => {
            tokio::task::spawn_blocking(move || {
                (opencode::run(run_input), "opencode")
            })
            .await
            .unwrap_or_else(|_| (Err(AppError::Agent("participant task panicked".into())), "unknown"))
        }
        _ => {
            (Err(AppError::Agent(format!("unsupported engine: {}", engine_key_owned))), "unknown")
        }
    };

    let (run_result, engine_label) = result;
    match run_result {
        Ok(out) => ParticipantResult {
            name, engine: engine_label.to_string(), model, content: out.content,
            status: "done".into(), cost_usd: out.cost_usd,
            in_tokens: out.input_tokens, out_tokens: out.output_tokens,
            prompt_sources: sources_json, blind, session_id: out.session_id,
        },
        Err(e) => ParticipantResult {
            name, engine: engine_label.to_string(), model, content: format!("Error: {}", e),
            status: "error".into(), cost_usd: 0.0, in_tokens: 0, out_tokens: 0,
            prompt_sources: sources_json, blind, session_id: None,
        },
    }
}

/// Dispatch to Sequential or Deliberative execution.
pub async fn execute_round(
    participants: &[RoundtableParticipant],
    transcript: &[(String, String)],
    round_num: u32,
    total_rounds: u32,
    topic: &str,
    strategy: RoundStrategy,
    rt_mode: &str,
    conversation_id: &str,
    state: &DbState,
    app: &tauri::AppHandle,
    cancel: &CancelRegistry,
    trace_id: &str,
    root_span_id: &str,
    project_path: Option<&str>,
    session_map: &mut SessionMap,
) -> Result<(Vec<Message>, Vec<(String, String)>), AppError> {
    let prior_refs: Vec<String> = transcript.iter().map(|(n, _)| n.clone()).collect();

    match strategy {
        RoundStrategy::Sequential => super::sequential::execute_sequential(
            participants, transcript, &prior_refs, round_num, total_rounds, topic, rt_mode,
            conversation_id, state, app, cancel, trace_id, root_span_id, project_path, session_map,
        ).await,
        RoundStrategy::Deliberative => super::deliberative::execute_parallel(
            participants, transcript, &prior_refs, round_num, total_rounds, topic, rt_mode,
            conversation_id, state, app, cancel, trace_id, root_span_id, project_path, session_map,
        ).await,
    }
}
