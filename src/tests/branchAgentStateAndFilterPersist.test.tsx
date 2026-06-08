// branch agent state + workflow filter persistence — 다모앙 사용자 보고 2건.
//
// 1) branch/RT 전환 시 engine/model/persona 초기화 (shadow conv engine 상속
//    부재). openBranchStream 이 부모 conv 의 engine 을 shadow conv 키
//    (`branch:<branchId>`) 로 상속해야 한다. 첫 진입만 상속, 재진입 시
//    사용자가 branch 안에서 바꾼 engine 은 보존 (T1/T2, INV-BAF-1/2).
// 2) workflow filter 가 plan status 변경 후 "plan-check" 으로 강제 리셋.
//    CenterPanel 의 onStatusChanged 는 stage 를 건드리지 않고, phase 변경
//    (onPhaseChanged → PHASE_TO_STAGE) 만 자동 전환해야 한다 (T3, INV-BAF-3/4).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "@/stores/chatStore";
import { CenterPanel } from "@/components/tunaflow/CenterPanel";
import type { Conversation } from "@/types";
import type { ConversationEngineState } from "@/stores/slices/assetSlice";

const mockedInvoke = vi.mocked(invoke);

const conv = (id: string): Conversation => ({
  id,
  projectKey: "p",
  label: id,
  type: "main",
  mode: "chat",
  source: "tunadish",
  createdAt: 0,
  updatedAt: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCostUsd: 0,
});

// openBranchStream issues: open_branch_stream → branchConvId, then
// list_messages + get_conversation. Route by command name.
const wireBranchInvoke = (branchConvId: string) => {
  mockedInvoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "open_branch_stream":
        return branchConvId;
      case "list_messages":
        return [];
      case "get_conversation":
        return conv(branchConvId);
      default:
        return undefined;
    }
  });
};

describe("openBranchStream — shadow conv engine 상속 (T1/T2)", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    const s = useChatStore.getState();
    s.resetConversationData();
    s.resetBranchState();
    s.clearConversationAssets();
    useChatStore.setState({ _convEngineMap: {} });
  });

  it("첫 진입: 부모 conv 의 engine 을 shadow conv 키로 상속한다 (INV-BAF-1)", async () => {
    const parentId = "conv-parent";
    const branchConvId = "branch:b1";
    const parentEngine: ConversationEngineState = {
      profileId: "reviewer-codex",
      engine: "codex",
      model: "gpt-5-codex",
      source: "user-explicit",
    };
    useChatStore.setState({
      conversations: [conv(parentId)],
      selectedConversationId: parentId,
    });
    useChatStore.getState().saveConversationEngine(parentId, parentEngine);
    wireBranchInvoke(branchConvId);

    await useChatStore.getState().openBranchStream("b1");

    const s = useChatStore.getState();
    expect(s.selectedConversationId).toBe(branchConvId);
    // shadow conv 키에 부모 engine 이 그대로 상속됨
    expect(s.getConversationEngine(branchConvId)).toEqual(parentEngine);
  });

  it("재진입: 사용자가 branch 안에서 바꾼 engine 을 덮어쓰지 않는다 (T2)", async () => {
    const parentId = "conv-parent";
    const branchConvId = "branch:b1";
    useChatStore.setState({
      conversations: [conv(parentId)],
      selectedConversationId: parentId,
    });
    useChatStore.getState().saveConversationEngine(parentId, {
      profileId: "reviewer-codex", engine: "codex", model: "gpt-5-codex", source: "user-explicit",
    });
    // 사용자가 이전에 branch 안에서 gemini 로 바꿔둔 상태
    const userChoice: ConversationEngineState = {
      profileId: null, engine: "gemini", model: "gemini-2.5-pro", source: "user-explicit",
    };
    useChatStore.getState().saveConversationEngine(branchConvId, userChoice);
    wireBranchInvoke(branchConvId);

    await useChatStore.getState().openBranchStream("b1");

    // 재진입 시 부모(codex)로 덮어쓰지 않고 사용자 선택(gemini) 보존
    expect(useChatStore.getState().getConversationEngine(branchConvId)).toEqual(userChoice);
  });

  it("부모 engine 미설정 시 상속하지 않는다 — 기존 default 동작 보존 (INV-BAF-2)", async () => {
    const parentId = "conv-parent";
    const branchConvId = "branch:b1";
    useChatStore.setState({
      conversations: [conv(parentId)],
      selectedConversationId: parentId,
    });
    // 부모 conv 에 engine 미설정 (첫 방문)
    wireBranchInvoke(branchConvId);

    await useChatStore.getState().openBranchStream("b1");

    // shadow conv 키도 비어 있음 → NewMessageInput 이 기존 default profile 적용
    expect(useChatStore.getState().getConversationEngine(branchConvId)).toBeNull();
  });
});

// CenterPanel 의 onStatusChanged / onPhaseChanged 콜백 계약 검증.
// PlansPanel 을 mock 으로 대체해 콜백을 캡처하고, 호출 후 CenterPanel 이
// PlansPanel 에 넘기는 activeStage prop 의 변화를 관찰한다.
let capturedOnStatusChanged: (() => void) | undefined;
let capturedOnPhaseChanged: ((id: string, phase: string) => void) | undefined;
let lastActiveStage: string | undefined;

vi.mock("@/components/tunaflow/context-panel/PlansPanel", () => ({
  PlansPanel: (props: {
    activeStage?: string;
    onStatusChanged?: () => void;
    onPhaseChanged?: (id: string, phase: string) => void;
  }) => {
    capturedOnStatusChanged = props.onStatusChanged;
    capturedOnPhaseChanged = props.onPhaseChanged as typeof capturedOnPhaseChanged;
    lastActiveStage = props.activeStage;
    return <div data-testid="plans-panel-stage">{props.activeStage}</div>;
  },
}));

// HarnessSummary also receives activeStage — keep it light + observable.
vi.mock("@/components/tunaflow/HarnessSummary", () => ({
  HarnessSummary: (props: { activeStage?: string }) => (
    <div data-testid="harness-stage">{props.activeStage}</div>
  ),
}));

// ChatPanel is not under test and pulls in NewMessageInput → PTY store; stub it
// so CenterPanel's own onStatusChanged/onPhaseChanged wiring stays real.
vi.mock("@/components/tunaflow/ChatPanel", () => ({
  ChatPanel: () => <div data-testid="chat-panel" />,
}));

describe("CenterPanel workflow filter 유지 (T3 / INV-BAF-3/4)", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue([] as unknown as never);
    capturedOnStatusChanged = undefined;
    capturedOnPhaseChanged = undefined;
    lastActiveStage = undefined;
    const s = useChatStore.getState();
    s.resetConversationData();
    s.resetBranchState();
    useChatStore.setState({
      conversations: [conv("c1")],
      selectedConversationId: "c1",
      activeBranchId: null,
      parentConversationId: null,
      agentProfiles: [],
    });
  });

  const renderWorkflow = () => {
    const utils = render(<CenterPanel />);
    // CenterPanel defaults to Chat tab — switch to Workflow so PlansPanel mounts.
    const workflowTab = utils.getByText("Workflow");
    act(() => {
      workflowTab.click();
    });
    return utils;
  };

  it("status 변경(done/draft 등) 시 활성 필터를 plan-check 으로 리셋하지 않는다", () => {
    renderWorkflow();
    // 사용자가 'done' 필터를 선택한 상태로 둔다.
    act(() => {
      capturedOnPhaseChanged?.("p1", "done"); // PHASE_TO_STAGE['done'] = 'done'
    });
    expect(lastActiveStage).toBe("done");

    // plan status 변경 발생 — 필터는 그대로 'done' 유지되어야 한다.
    act(() => {
      capturedOnStatusChanged?.();
    });
    expect(lastActiveStage).toBe("done");
  });

  it("phase 변경 시 자동 stage 전환은 보존된다 (INV-BAF-4)", () => {
    renderWorkflow();
    act(() => {
      capturedOnPhaseChanged?.("p1", "implementation"); // → 'dev'
    });
    expect(lastActiveStage).toBe("dev");
    act(() => {
      capturedOnPhaseChanged?.("p1", "review"); // → 'review'
    });
    expect(lastActiveStage).toBe("review");
  });
});
