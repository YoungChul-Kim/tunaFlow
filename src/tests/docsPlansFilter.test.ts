import { describe, it, expect } from "vitest";
import type { Plan } from "@/types";
import {
  type DocEntry,
  isCompanionPlanFile,
  buildSlugToPlan,
  planForEntry,
  matchesDateFilter,
  filterDocEntry,
  isFilterActive,
  DAY_MS,
} from "@/components/tunaflow/sidebar/planDocsFilter";

// docsPlansOrganizationPlan_2026-05-29 (T5) — T1 slug join + T2 필터 회귀 가드.

function mkPlan(slug: string, status: Plan["status"], updatedAt: number): Plan {
  return {
    id: `id-${slug}`,
    conversationId: "c",
    title: `${slug} title`,
    status,
    phase: "drafting",
    slug,
    revision: 0,
    versionMajor: 1,
    versionMinor: 0,
    createdAt: 0,
    updatedAt,
  } as Plan;
}

function file(name: string, path?: string): DocEntry {
  return { name, path: path ?? `/repo/docs/plans/${name}`, isDir: false };
}

describe("planDocsFilter — companion detection (T1, handoff DO #2)", () => {
  it("동반 파일 (-task-NN / -review-rN / -result) 은 companion", () => {
    expect(isCompanionPlanFile("myPlan-task-01")).toBe(true);
    expect(isCompanionPlanFile("myPlan-task-12")).toBe(true);
    expect(isCompanionPlanFile("myPlan-review-r2")).toBe(true);
    expect(isCompanionPlanFile("myPlan-result")).toBe(true);
  });
  it("본문 plan slug 은 companion 아님", () => {
    expect(isCompanionPlanFile("myPlan")).toBe(false);
    expect(isCompanionPlanFile("docsPlansOrganizationPlan_2026-05-29")).toBe(false);
  });
});

describe("planDocsFilter — planForEntry slug join (T1)", () => {
  const plans = [mkPlan("alphaPlan", "active", 1000), mkPlan("betaPlan", "done", 2000)];
  const map = buildSlugToPlan(plans);

  it("docs/plans/{slug}.md 본문 → DB plan 매칭", () => {
    expect(planForEntry(file("alphaPlan.md"), map)?.id).toBe("id-alphaPlan");
    expect(planForEntry(file("betaPlan.md"), map)?.status).toBe("done");
  });

  it("DB 미등록 doc → null (graceful, 배지 없음)", () => {
    expect(planForEntry(file("notInDb.md"), map)).toBeNull();
  });

  it("동반 파일 → null (본문만 배지)", () => {
    expect(planForEntry(file("alphaPlan-task-01.md"), map)).toBeNull();
    expect(planForEntry(file("alphaPlan-result.md"), map)).toBeNull();
  });

  it("plans 폴더 밖 / 디렉터리 / 비-md → null", () => {
    expect(planForEntry(file("alphaPlan.md", "/repo/docs/reference/alphaPlan.md"), map)).toBeNull();
    expect(planForEntry({ name: "plans", path: "/repo/docs/plans", isDir: true }, map)).toBeNull();
    expect(planForEntry(file("alphaPlan.txt"), map)).toBeNull();
  });

  it("windows 경로 (\\docs\\plans\\) 도 매칭", () => {
    const e: DocEntry = { name: "alphaPlan.md", path: "C:\\repo\\docs\\plans\\alphaPlan.md", isDir: false };
    expect(planForEntry(e, map)?.id).toBe("id-alphaPlan");
  });
});

describe("planDocsFilter — matchesDateFilter (T2, updated_at 기준)", () => {
  const now = 1_700_000_000_000;
  it("all 은 항상 통과", () => {
    expect(matchesDateFilter(0, "all", now)).toBe(true);
  });
  it("7d / 30d 경계", () => {
    expect(matchesDateFilter(now - 3 * DAY_MS, "7d", now)).toBe(true);
    expect(matchesDateFilter(now - 8 * DAY_MS, "7d", now)).toBe(false);
    expect(matchesDateFilter(now - 20 * DAY_MS, "30d", now)).toBe(true);
    expect(matchesDateFilter(now - 40 * DAY_MS, "30d", now)).toBe(false);
  });
  it("month 은 같은 연/월만 통과", () => {
    const jan15 = new Date(2026, 0, 15).getTime();
    const jan2 = new Date(2026, 0, 2).getTime();
    const dec31 = new Date(2025, 11, 31).getTime();
    expect(matchesDateFilter(jan2, "month", jan15)).toBe(true);
    expect(matchesDateFilter(dec31, "month", jan15)).toBe(false);
  });
});

describe("planDocsFilter — filterDocEntry tree (T2)", () => {
  const now = 1_700_000_000_000;
  const plans = [
    mkPlan("activePlan", "active", now - DAY_MS),
    mkPlan("donePlan", "done", now - 100 * DAY_MS),
    mkPlan("recentDraft", "draft", now - 2 * DAY_MS),
  ];
  const map = buildSlugToPlan(plans);

  const tree: DocEntry[] = [
    {
      name: "plans",
      path: "/repo/docs/plans",
      isDir: true,
      children: [
        file("activePlan.md"),
        file("donePlan.md"),
        file("recentDraft.md"),
        file("pureDoc.md"), // DB 미등록
        file("activePlan-task-01.md"), // 동반 파일
      ],
    },
  ];

  function flatten(entries: DocEntry[]): string[] {
    const out: string[] = [];
    for (const e of entries) {
      if (e.isDir) out.push(...flatten(e.children ?? []));
      else out.push(e.name);
    }
    return out;
  }

  it("status=done → done plan 만 (미등록·동반은 graceful 유지)", () => {
    const filtered = tree
      .map((e) => filterDocEntry(e, map, "done", "all", now))
      .filter((e): e is DocEntry => e !== null);
    const names = flatten(filtered);
    expect(names).toContain("donePlan.md");
    expect(names).not.toContain("activePlan.md");
    expect(names).not.toContain("recentDraft.md");
    // DB 미등록 doc + 동반 파일은 필터 무관 항상 표시.
    expect(names).toContain("pureDoc.md");
    expect(names).toContain("activePlan-task-01.md");
  });

  it("date=7d → 최근 갱신 plan + 미등록/동반", () => {
    const filtered = tree
      .map((e) => filterDocEntry(e, map, "all", "7d", now))
      .filter((e): e is DocEntry => e !== null);
    const names = flatten(filtered);
    expect(names).toContain("activePlan.md"); // -1일
    expect(names).toContain("recentDraft.md"); // -2일
    expect(names).not.toContain("donePlan.md"); // -100일
    expect(names).toContain("pureDoc.md"); // 미등록 graceful
  });

  it("status=all+date=all → isFilterActive false (회귀 0)", () => {
    expect(isFilterActive("all", "all")).toBe(false);
    expect(isFilterActive("done", "all")).toBe(true);
    expect(isFilterActive("all", "7d")).toBe(true);
  });
});
