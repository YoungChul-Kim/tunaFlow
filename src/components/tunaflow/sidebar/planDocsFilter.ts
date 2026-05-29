// docs/plans 항목의 DB plan 메타 join + 가상 필터 (status/날짜) 순수 로직.
// docsPlansOrganizationPlan_2026-05-29 (T1/T2). 필터 source = DB `plans`
// 테이블 (frontmatter 파싱 안 함, INV-DPO-1). 경로 불변 (frontend 필터링).

import type { Plan, PlanStatus } from "@/types";

export interface DocEntry {
  name: string;
  path: string;
  isDir: boolean;
  children?: DocEntry[];
}

/** status 필터 옵션 — DB PlanStatus enum 정합 (draft/active/done/abandoned). */
export type StatusFilter = "all" | PlanStatus;
export const STATUS_OPTIONS: StatusFilter[] = ["all", "draft", "active", "done", "abandoned"];

/** 날짜 필터 옵션 — updated_at 기준 버킷. "month" = 이번 달. */
export type DateFilter = "all" | "7d" | "30d" | "month";
export const DATE_OPTIONS: DateFilter[] = ["all", "7d", "30d", "month"];

export const DAY_MS = 24 * 60 * 60 * 1000;

/** docs/plans 의 본문 plan 파일만 배지 대상. 동반 파일 (-task-NN / -review-rN /
 *  -result) 은 평면 표시 (배지 없음) — Phase 1 결정 (handoff DO #2). */
export function isCompanionPlanFile(slug: string): boolean {
  return /-task-\d+$/.test(slug) || /-review-r\d+$/.test(slug) || /-result$/.test(slug);
}

/** plans 배열 → slug→Plan 맵. DB slug 가 곧 docs/plans/{slug}.md 파일명. */
export function buildSlugToPlan(plans: Plan[]): Map<string, Plan> {
  const m = new Map<string, Plan>();
  for (const p of plans) {
    if (p.slug) m.set(p.slug, p);
  }
  return m;
}

/** 파일 entry → 매칭되는 DB plan (없으면 null).
 *  docs/plans/{slug}.md 의 파일명 slug → slugToPlan lookup.
 *  동반 파일·DB 미등록 doc·디렉터리·비-plans 경로 는 null (graceful). */
export function planForEntry(entry: DocEntry, slugToPlan: Map<string, Plan>): Plan | null {
  if (entry.isDir) return null;
  if (!entry.name.endsWith(".md")) return null;
  // docs/plans/ 하위 파일만 대상 (posix + windows 경로 모두 허용).
  if (!entry.path.includes("/docs/plans/") && !entry.path.includes("\\docs\\plans\\")) {
    return null;
  }
  const slug = entry.name.slice(0, -3); // strip ".md"
  if (isCompanionPlanFile(slug)) return null;
  return slugToPlan.get(slug) ?? null;
}

/** updated_at(ms) 가 선택 날짜 버킷에 드는가. */
export function matchesDateFilter(updatedAtMs: number, filter: DateFilter, now: number): boolean {
  if (filter === "all") return true;
  if (filter === "7d") return now - updatedAtMs <= 7 * DAY_MS;
  if (filter === "30d") return now - updatedAtMs <= 30 * DAY_MS;
  if (filter === "month") {
    const a = new Date(updatedAtMs);
    const b = new Date(now);
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }
  return true;
}

/** entry 트리에 필터 적용 — DB plan 메타가 있는 파일만 status/날짜로 거른다.
 *  DB 미등록 doc·디렉터리·동반 파일은 항상 표시 (graceful, INV-DPO-1).
 *  디렉터리는 유지하고 자식만 재귀 필터. null 반환 = 숨김. */
export function filterDocEntry(
  entry: DocEntry,
  slugToPlan: Map<string, Plan>,
  statusFilter: StatusFilter,
  dateFilter: DateFilter,
  now: number,
): DocEntry | null {
  if (entry.isDir) {
    const children = (entry.children ?? [])
      .map((c) => filterDocEntry(c, slugToPlan, statusFilter, dateFilter, now))
      .filter((c): c is DocEntry => c !== null);
    return { ...entry, children };
  }
  const plan = planForEntry(entry, slugToPlan);
  if (!plan) return entry; // DB 미등록 → 항상 표시.
  if (statusFilter !== "all" && plan.status !== statusFilter) return null;
  if (!matchesDateFilter(plan.updatedAt, dateFilter, now)) return null;
  return entry;
}

export function isFilterActive(statusFilter: StatusFilter, dateFilter: DateFilter): boolean {
  return statusFilter !== "all" || dateFilter !== "all";
}
