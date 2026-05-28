/**
 * planFilePath — cross-generator file path consistency.
 *
 * 외부 사용자 메신저 보고 (2026-05-28): Plan chat 안내 vs Dev chat handoff
 * vs Reviewer prompt vs loadTaskFileTitles 4 곳이 같은 plan 의 같은 subtask
 * 에 대해 서로 다른 파일명을 발급하던 회귀. slug + indexing 두 axis 의
 * 일관성을 단위 + cross-generator 두 층에서 보장한다.
 *
 * Plan: docs/plans/planSubtaskFilePathConsistencyPlan_2026-05-28.md (T4)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Plan, PlanSubtask } from "@/types";

// ─── invoke / planApi / helpers mocks ──────────────────────────────────────

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const listSubtasks = vi.fn<(planId: string) => Promise<PlanSubtask[]>>();
const updatePlanPhase = vi.fn(async () => undefined);
const updatePlanStatus = vi.fn(async () => undefined);
const createPlanEvent = vi.fn(async () => undefined);
const assignPlanEngines = vi.fn(async () => undefined);
const linkPlanBranch = vi.fn(async () => undefined);
const listPlanEvents = vi.fn(async () => []);

vi.mock("@/lib/api/plans", () => ({
  listSubtasks: (planId: string) => listSubtasks(planId),
  updatePlanPhase: (...a: unknown[]) => updatePlanPhase(...(a as [])),
  updatePlanStatus: (...a: unknown[]) => updatePlanStatus(...(a as [])),
  createPlanEvent: (...a: unknown[]) => createPlanEvent(...(a as [])),
  assignPlanEngines: (...a: unknown[]) => assignPlanEngines(...(a as [])),
  linkPlanBranch: (...a: unknown[]) => linkPlanBranch(...(a as [])),
  listPlanEvents: (...a: unknown[]) => listPlanEvents(...(a as [])),
  replacePlanSubtasks: vi.fn(async () => []),
}));

vi.mock("../api/artifacts", () => ({
  createArtifact: vi.fn(async () => undefined),
}));

import { getPlanSlug, slugifyPlanTitle } from "./helpers";
import { approveAndStartImplementation } from "./implementWorkflow";
import { autoRecoverSubtasks, loadTaskFileTitles } from "./planWorkflowService";

// ─── fixtures ──────────────────────────────────────────────────────────────

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "p-1",
    conversationId: "conv-1",
    title: "신규 채널 추가",
    description: "",
    status: "active",
    phase: "implementation",
    revision: 1,
    versionMajor: 1,
    versionMinor: 0,
    createdAt: 0,
    updatedAt: 0,
    slug: "plan-10", // backend collision-resolved slug
    ...overrides,
  };
}

function makeSubtasks(count: number): PlanSubtask[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `st-${i}`,
    planId: "p-1",
    idx: i, // DB stores 0-based (INV-SPC-3)
    title: `subtask ${i + 1}`,
    status: "todo" as const,
    createdAt: 0,
    updatedAt: 0,
  }));
}

/**
 * Mirror PlanProposalCard line ~312 — the Plan chat advertises task files
 * via the i18n template `task_line` = `…/{{slug}}-task-{{num}}.md`. We
 * recreate the call site so the test asserts the contract Plan chat uses,
 * not the component itself (which depends on React/i18n setup).
 */
function planChatTaskFiles(plan: Plan, subtasks: PlanSubtask[]): string[] {
  const slug = getPlanSlug({ slug: plan.slug, title: plan.title });
  return subtasks.map(
    (_, i) => `docs/plans/${slug}-task-${String(i + 1).padStart(2, "0")}.md`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  invokeMock.mockReset();
});

// ─── unit: getPlanSlug ─────────────────────────────────────────────────────

describe("getPlanSlug — slug source", () => {
  it("prefers DB slug when present (handles backend collision counter)", () => {
    expect(getPlanSlug({ slug: "plan-10", title: "신규 채널 추가" })).toBe("plan-10");
  });

  it("falls back to slugifyPlanTitle when DB slug is missing", () => {
    expect(getPlanSlug({ slug: undefined, title: "Auth refactor" })).toBe("auth-refactor");
  });

  it("falls back to literal 'plan' for Korean-only titles when DB slug missing", () => {
    // mirrors the legacy frontend-only behaviour — this is exactly the case
    // that diverged from the backend ("plan-10") before T1 was applied.
    expect(getPlanSlug({ slug: undefined, title: "신규 채널 추가" })).toBe("plan");
  });

  it("treats null DB slug the same as missing", () => {
    expect(getPlanSlug({ slug: null, title: "Auth refactor" })).toBe("auth-refactor");
  });
});

// ─── unit: slugifyPlanTitle stays stable ───────────────────────────────────

describe("slugifyPlanTitle — fallback contract", () => {
  it("produces stable slug for ASCII titles", () => {
    expect(slugifyPlanTitle("Auth refactor")).toBe("auth-refactor");
  });

  it("collapses non-ASCII to single dashes and falls back to 'plan' when empty", () => {
    expect(slugifyPlanTitle("신규 채널 추가")).toBe("plan");
  });
});

// ─── unit: Dev chat (approveAndStartImplementation) ────────────────────────

describe("Dev chat handoff (approveAndStartImplementation)", () => {
  it("uses DB plan.slug + 1-based file path numbering (T1+T2)", async () => {
    const plan = makePlan({ slug: "plan-10" });
    const subtasks = makeSubtasks(4);
    // approveAndStartImplementation 안에서 listSubtasks 가 두 번 호출됨
    // (createArchitectDecisionArtifact + 본 함수). mockResolvedValue 로 항상
    // 동일 결과 반환하도록 한다 — once 가 아님.
    listSubtasks.mockResolvedValue(subtasks);
    // create_branch / open_branch_stream / list_plan_events / artifact …
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "create_branch") {
        return { id: "br-1", conversationId: "conv-1", label: "dev", status: "active" };
      }
      if (cmd === "open_branch_stream") return "branch:br-1";
      if (cmd === "list_plan_events") return [];
      // createArchitectDecisionArtifact → listSubtasks (already mocked) +
      // artifactApi.createArtifact (mocked above). Anything else: noop.
      return undefined;
    });

    const { prompt } = await approveAndStartImplementation(plan, "claude");

    expect(prompt).toContain("docs/plans/plan-10-task-01.md");
    expect(prompt).toContain("docs/plans/plan-10-task-02.md");
    expect(prompt).toContain("docs/plans/plan-10-task-03.md");
    expect(prompt).toContain("docs/plans/plan-10-task-04.md");
    // T2 regression guard — must NOT emit 0-indexed file paths.
    expect(prompt).not.toContain("plan-10-task-00.md");
    // T3 — full plan document path is now part of the dev handoff.
    expect(prompt).toContain("docs/plans/plan-10.md");
  });

  it("falls back to slugified title when plan.slug is missing", async () => {
    const plan = makePlan({ slug: undefined, title: "Auth refactor" });
    listSubtasks.mockResolvedValue(makeSubtasks(2));
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "create_branch") {
        return { id: "br-1", conversationId: "conv-1", label: "dev", status: "active" };
      }
      if (cmd === "open_branch_stream") return "branch:br-1";
      return [];
    });

    const { prompt } = await approveAndStartImplementation(plan, "claude");

    expect(prompt).toContain("docs/plans/auth-refactor-task-01.md");
    expect(prompt).toContain("docs/plans/auth-refactor-task-02.md");
    expect(prompt).toContain("docs/plans/auth-refactor.md");
  });
});

// ─── unit: loadTaskFileTitles ──────────────────────────────────────────────

describe("loadTaskFileTitles — Reviewer / Architect context", () => {
  it("requests 1-based file paths using DB slug", async () => {
    const plan = makePlan({ slug: "plan-10" });
    const askedPaths: string[] = [];
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_project") return { path: "/repo" };
      if (cmd === "read_text_file") {
        askedPaths.push(args!.filePath as string);
        // return a heading-shaped body so the function records a title
        return { content: `# title ${askedPaths.length}\nbody` };
      }
      return null;
    });

    const titles = await loadTaskFileTitles(plan, "proj", 3);

    expect(askedPaths).toEqual([
      "/repo/docs/plans/plan-10-task-01.md",
      "/repo/docs/plans/plan-10-task-02.md",
      "/repo/docs/plans/plan-10-task-03.md",
    ]);
    expect(Object.keys(titles).sort()).toEqual(["1", "2", "3"]);
  });
});

// ─── unit: autoRecoverSubtasks backward compat ─────────────────────────────

describe("autoRecoverSubtasks — backward compat regex", () => {
  it("matches both legacy 0-indexed and current 1-indexed file names", async () => {
    const plan = makePlan({ slug: "plan-10" });
    const replaced: string[] = [];

    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_project") return { path: "/repo" };
      if (cmd === "list_directory") {
        return [
          // mixed-indexing on disk (legacy 0-based + new 1-based)
          { name: "plan-10-task-00.md", path: "/repo/docs/plans/plan-10-task-00.md", isDir: false },
          { name: "plan-10-task-01.md", path: "/repo/docs/plans/plan-10-task-01.md", isDir: false },
          { name: "plan-10-task-02.md", path: "/repo/docs/plans/plan-10-task-02.md", isDir: false },
          // unrelated noise — must be filtered
          { name: "plan-10.md", path: "/repo/docs/plans/plan-10.md", isDir: false },
          { name: "other-task-01.md", path: "/repo/docs/plans/other-task-01.md", isDir: false },
          { name: "subdir", path: "/repo/docs/plans/subdir", isDir: true },
        ];
      }
      if (cmd === "read_file_content") {
        const path = args!.path as string;
        replaced.push(path);
        return `# ${path.split("/").pop()} title\nbody`;
      }
      return undefined;
    });

    await autoRecoverSubtasks(plan, "proj");

    // INV-SPC-4 — regex matches both indexing styles, filters unrelated files.
    expect(replaced).toEqual([
      "/repo/docs/plans/plan-10-task-00.md",
      "/repo/docs/plans/plan-10-task-01.md",
      "/repo/docs/plans/plan-10-task-02.md",
    ]);
  });
});

// ─── cross-generator consistency ───────────────────────────────────────────

describe("cross-generator — Plan chat / Dev chat / loadTaskFileTitles agree", () => {
  async function devChatPaths(plan: Plan, subtasks: PlanSubtask[]): Promise<string[]> {
    listSubtasks.mockResolvedValue(subtasks);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "create_branch") {
        return { id: "br-x", conversationId: plan.conversationId, label: "dev", status: "active" };
      }
      if (cmd === "open_branch_stream") return "branch:br-x";
      return [];
    });
    const { prompt } = await approveAndStartImplementation(plan, "claude");
    return Array.from(prompt.matchAll(/docs\/plans\/[A-Za-z0-9-]+-task-\d{2}\.md/g)).map(
      (m) => m[0],
    );
  }

  async function reviewerLoadPaths(plan: Plan, count: number): Promise<string[]> {
    // loadTaskFileTitles 는 `project.path` 가 truthy 일 때만 read 를 수행.
    // 일관성 비교에는 prefix 만 동일하면 충분하므로 임의 root 로 cover 한 뒤
    // 결과 path 에서 root 를 제거해 generator 간 동일 path 비교가 가능하게 한다.
    const root = "/r";
    const seen: string[] = [];
    invokeMock.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_project") return { path: root };
      if (cmd === "read_text_file") {
        const stripped = (args!.filePath as string).replace(`${root}/`, "");
        seen.push(stripped);
        return { content: "" };
      }
      return null;
    });
    await loadTaskFileTitles(plan, "proj", count);
    return seen;
  }

  it("case 1 — Korean title + collision-resolved DB slug 'plan-10'", async () => {
    const plan = makePlan({ slug: "plan-10", title: "신규 채널 추가" });
    const subtasks = makeSubtasks(4);

    const planChat = planChatTaskFiles(plan, subtasks);
    const devChat = await devChatPaths(plan, subtasks);
    const reviewer = await reviewerLoadPaths(plan, subtasks.length);

    const expected = [
      "docs/plans/plan-10-task-01.md",
      "docs/plans/plan-10-task-02.md",
      "docs/plans/plan-10-task-03.md",
      "docs/plans/plan-10-task-04.md",
    ];
    expect(planChat).toEqual(expected);
    expect(devChat).toEqual(expected);
    expect(reviewer).toEqual(expected);
  });

  it("case 2 — English title + DB slug derived from title", async () => {
    const plan = makePlan({ slug: "auth-refactor", title: "Auth refactor" });
    const subtasks = makeSubtasks(3);

    const planChat = planChatTaskFiles(plan, subtasks);
    const devChat = await devChatPaths(plan, subtasks);
    const reviewer = await reviewerLoadPaths(plan, subtasks.length);

    const expected = [
      "docs/plans/auth-refactor-task-01.md",
      "docs/plans/auth-refactor-task-02.md",
      "docs/plans/auth-refactor-task-03.md",
    ];
    expect(planChat).toEqual(expected);
    expect(devChat).toEqual(expected);
    expect(reviewer).toEqual(expected);
  });

  it("case 3 — slug missing from backend response: same fallback in every generator", async () => {
    const plan = makePlan({ slug: undefined, title: "Refactor X" });
    const subtasks = makeSubtasks(2);

    const planChat = planChatTaskFiles(plan, subtasks);
    const devChat = await devChatPaths(plan, subtasks);
    const reviewer = await reviewerLoadPaths(plan, subtasks.length);

    const expected = [
      "docs/plans/refactor-x-task-01.md",
      "docs/plans/refactor-x-task-02.md",
    ];
    expect(planChat).toEqual(expected);
    expect(devChat).toEqual(expected);
    expect(reviewer).toEqual(expected);
  });
});
