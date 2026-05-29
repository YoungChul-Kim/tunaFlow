import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { FileText, ChevronRight, ChevronDown, Folder, FolderOpen, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileViewer } from "../chat/fileViewerContext";
import { SidebarContextMenu, type ContextMenuState } from "./SidebarContextMenu";
import { copyToClipboard } from "@/lib/clipboard";
import { getSetting } from "@/lib/appStore";
import { listPlansByProject } from "@/lib/api/plans";
import type { Plan, PlanStatus } from "@/types";
import {
  type DocEntry,
  type StatusFilter,
  type DateFilter,
  STATUS_OPTIONS,
  DATE_OPTIONS,
  buildSlugToPlan,
  planForEntry,
  filterDocEntry,
  isFilterActive,
} from "./planDocsFilter";
import {
  DOCS_PANEL_SCOPE_KEY,
  DOCS_PANEL_SCOPE_DEFAULT,
  type DocsPanelScope,
} from "../settings/DocsScopeSection";

interface DocsScanResult {
  entries: DocEntry[];
  fileCount: number;
  truncated: boolean;
}

/** Plan E (2026-04-29) — file count >200 시 1회 toast.
 *  Threshold 는 plan SSOT 고정. lazy load 는 Phase 2. */
const DOCS_PANEL_WARNING_THRESHOLD = 200;

const EMPTY_RESULT: DocsScanResult = { entries: [], fileCount: 0, truncated: false };

// ─── Plan metadata join (T1/T2, docsPlansOrganizationPlan_2026-05-29) ────────
//
// docs/plans 항목의 status/날짜 배지·필터 source = DB `plans` 테이블
// (`list_plans_by_project`). frontmatter 파싱 안 함 — 옛 plan 의
// `> Status:` blockquote 형식 불일치를 회피하기 위함 (INV-DPO-1).
// 순수 join/필터 로직은 planDocsFilter.ts (단위 테스트 대상).

const STATUS_BADGE_CLASS: Record<PlanStatus, string> = {
  draft: "bg-sidebar-accent/40 text-sidebar-foreground/50",
  active: "bg-emerald-500/15 text-emerald-400",
  done: "bg-sky-500/15 text-sky-400",
  abandoned: "bg-zinc-500/15 text-sidebar-foreground/40",
};

async function scanDocs(projectPath: string, scope: DocsPanelScope): Promise<DocsScanResult> {
  try {
    const result = await invoke<DocsScanResult>("list_project_docs", {
      projectPath,
      scope,
    });
    // Defensive: tests / stub envs may resolve to undefined.
    if (!result || !Array.isArray(result.entries)) return EMPTY_RESULT;
    return result;
  } catch (e) {
    console.warn("[docs] list_project_docs failed:", e);
    return EMPTY_RESULT;
  }
}

async function loadPlanMeta(projectKey: string): Promise<Plan[]> {
  try {
    return await listPlansByProject(projectKey);
  } catch (e) {
    console.warn("[docs] list_plans_by_project failed:", e);
    return [];
  }
}

async function revealInFinder(path: string) {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
  } catch (e) {
    console.debug("[opener]", e);
  }
}

// ─── DocsSection ─────────────────────────────────────────────────────────────

interface DocsSectionProps {
  projectPath: string | null | undefined;
  projectKey: string | null | undefined;
}

export function DocsSection({ projectPath, projectKey }: DocsSectionProps) {
  const { t } = useTranslation("sidebar");
  const { t: tSettings } = useTranslation("settings");
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [scope, setScope] = useState<DocsPanelScope>(DOCS_PANEL_SCOPE_DEFAULT);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  // T2 — status/날짜 필터 (frontend state, 경로 불변).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  // T3 (gemini PR #301) — docs 목록 + plan 메타 재로드 trigger. window focus /
  // visibility 복귀 시 1회 증가 → chat 에서 일어난 plan status 변경·새 plan 생성이
  // 사이드바 배지·필터에 반영되도록 stale 해소. 타이머 polling 안 함 (과도한 re-fetch 회피).
  const [refreshTick, setRefreshTick] = useState(0);
  const fileViewer = useFileViewer();
  /** Toast 1회만 — 같은 (project,scope) 조합에서 재표시 X. */
  const warnedRef = useRef<Set<string>>(new Set());

  // 1) 초기 scope 로드 + scope 변경 이벤트 구독.
  useEffect(() => {
    let alive = true;
    getSetting<DocsPanelScope>(DOCS_PANEL_SCOPE_KEY, DOCS_PANEL_SCOPE_DEFAULT).then((v) => {
      if (alive) {
        setScope(v === "tunaflow" ? "tunaflow" : "all");
      }
    });
    const onScopeChange = (e: Event) => {
      const detail = (e as CustomEvent<{ scope: DocsPanelScope }>).detail;
      if (detail?.scope) {
        setScope(detail.scope === "tunaflow" ? "tunaflow" : "all");
      }
    };
    window.addEventListener("tf:docs-scope-changed", onScopeChange);
    return () => {
      alive = false;
      window.removeEventListener("tf:docs-scope-changed", onScopeChange);
    };
  }, []);

  // 1b) T3 (gemini PR #301) — window focus / visibility 복귀 시 refresh trigger.
  // chat 에서 plan status 변경·새 plan 생성 후 사용자가 창으로 돌아올 때 1회 재로드.
  useEffect(() => {
    const bump = () => setRefreshTick((n) => n + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 2) projectPath / scope / refreshTick 변경 시 다시 스캔.
  useEffect(() => {
    if (!projectPath) {
      setDocs([]);
      return;
    }
    let alive = true;
    scanDocs(projectPath, scope).then((result) => {
      if (!alive) return;
      setDocs(result.entries);
      // Task 03 — perf toast (Plan E 명시 threshold = 200, 1회).
      const warnKey = `${projectPath}::${scope}`;
      if (
        scope === "all" &&
        result.fileCount > DOCS_PANEL_WARNING_THRESHOLD &&
        !warnedRef.current.has(warnKey)
      ) {
        warnedRef.current.add(warnKey);
        toast.warning(
          tSettings("docs_scope.performance_warning", { count: result.fileCount }),
          { duration: 6000 },
        );
      }
    });
    return () => { alive = false; };
  }, [projectPath, scope, tSettings, refreshTick]);

  // 3) projectKey / refreshTick 변경 시 DB plan 메타 로드 (T1 join source).
  // T3 (gemini PR #301): refreshTick 의존으로 plan status 변경·새 plan 이
  // 배지·필터에 반영 (이전엔 projectKey 1회 로드 → stale).
  useEffect(() => {
    if (!projectKey) {
      setPlans([]);
      return;
    }
    let alive = true;
    loadPlanMeta(projectKey).then((rows) => {
      if (alive) setPlans(rows);
    });
    return () => { alive = false; };
  }, [projectKey, refreshTick]);

  /** slug → Plan. DB slug 가 곧 docs/plans/{slug}.md 파일명 (generate_plan_document). */
  const slugToPlan = useMemo(() => buildSlugToPlan(plans), [plans]);

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }, []);

  const openCtx = (e: React.MouseEvent, entry: DocEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: t("action.show_in_finder"),
          icon: <FolderOpen className="w-3.5 h-3.5" />,
          onClick: () => revealInFinder(entry.path),
        },
        {
          label: t("action.copy_path"),
          icon: <Copy className="w-3.5 h-3.5" />,
          onClick: () => copyToClipboard(entry.path),
        },
      ],
    });
  };

  /** 필터 적용 — DB plan 메타가 있는 항목만 status/날짜로 거른다.
   *  DB 미등록 doc·디렉터리·동반 파일은 항상 표시 (graceful, INV-DPO-1).
   *  필터가 모두 "all" 이면 원본 그대로 (회귀 0). 순수 로직은 planDocsFilter.ts. */
  const filterActive = isFilterActive(statusFilter, dateFilter);

  const visibleDocs = useMemo(() => {
    if (!filterActive) return docs;
    const now = Date.now();
    return docs
      .map((entry) => filterDocEntry(entry, slugToPlan, statusFilter, dateFilter, now))
      .filter((e): e is DocEntry => e !== null);
  }, [docs, filterActive, slugToPlan, statusFilter, dateFilter]);

  const renderEntry = (entry: DocEntry, depth: number) => {
    if (entry.isDir) {
      const isOpen = expanded.has(entry.path);
      return (
        <div key={entry.path}>
          <button
            onClick={() => toggle(entry.path)}
            onContextMenu={(e) => openCtx(e, entry)}
            className="w-full flex items-center gap-1 px-2 py-0.5 text-[11px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 rounded transition-colors select-none"
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            {isOpen ? <FolderOpen className="w-3 h-3 shrink-0 text-sidebar-foreground/40" /> : <Folder className="w-3 h-3 shrink-0 text-sidebar-foreground/30" />}
            <span className="truncate">{entry.name}/</span>
          </button>
          {isOpen && entry.children?.map((child) => renderEntry(child, depth + 1))}
        </div>
      );
    }

    const plan = planForEntry(entry, slugToPlan);
    return (
      <button
        key={entry.path}
        onClick={() => fileViewer?.openFile(entry.path)}
        onContextMenu={(e) => openCtx(e, entry)}
        className="w-full flex items-center gap-1.5 px-2 py-0.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/40 rounded transition-colors select-none"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        title={entry.path}
      >
        <FileText className="w-3 h-3 shrink-0 text-sidebar-foreground/25" />
        <span className="truncate">{entry.name}</span>
        {plan && (
          <span
            className={cn(
              "ml-auto shrink-0 px-1 rounded text-[9px] leading-tight uppercase tracking-wide",
              STATUS_BADGE_CLASS[plan.status],
            )}
            title={t(`plan_status.${plan.status}`)}
          >
            {t(`plan_status.${plan.status}`)}
          </span>
        )}
      </button>
    );
  };

  if (!projectPath) return null;

  return (
    <div className="py-1">
      <div className="px-3 pb-1 text-[10px] text-sidebar-foreground/30 select-none">
        {t(scope === "all" ? "docs_scope.all" : "docs_scope.tunaflow")}
      </div>

      {/* T2 — status + 날짜 필터 칩 (frontend state, 경로 불변). */}
      <div className="px-2 pb-1.5 flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide transition-colors select-none",
              statusFilter === s
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/40",
            )}
          >
            {t(`plan_filter.status.${s}`)}
          </button>
        ))}
      </div>
      <div className="px-2 pb-1.5 flex flex-wrap gap-1">
        {DATE_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDateFilter(d)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] tracking-wide transition-colors select-none",
              dateFilter === d
                ? "bg-sidebar-accent text-sidebar-foreground"
                : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/40",
            )}
          >
            {t(`plan_filter.date.${d}`)}
          </button>
        ))}
      </div>

      {visibleDocs.length === 0 ? (
        <p className="px-3 text-[10px] text-sidebar-foreground/25 italic">
          {filterActive ? t("empty.no_filtered_docs") : t("empty.no_docs")}
        </p>
      ) : (
        visibleDocs.map((entry) => renderEntry(entry, 0))
      )}
      {ctxMenu && <SidebarContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}
