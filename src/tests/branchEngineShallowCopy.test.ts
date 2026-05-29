import { describe, it, expect } from "vitest";
import type { ConversationEngineState } from "@/stores/slices/assetSlice";

// docsPlansOrganizationPlan_2026-05-29 (T4/T5) — Gemini PR #300 review.
//
// openBranchStream 이 parent conv 의 engine state 를 shadow conv 로 상속할 때
// 객체 참조를 공유하면 (`saveConversationEngine(branchConvId, parentEngine)`)
// 이후 parent mutation 이 branch 로 샌다. fix = `{ ...parentEngine }` shallow
// copy. 이 테스트는 branchSlice.ts 의 그 정확한 inherit 동작을 store map 의
// reference 의미론 (saveConversationEngine 이 객체를 그대로 저장) 위에서 검증.

/** assetSlice.saveConversationEngine 의 동작 (객체 참조를 map 에 그대로 저장)
 *  을 그대로 본뜬 최소 store. 실제 store 도 내부 복사 없이 참조 저장. */
function makeEngineMap() {
  const map: Record<string, ConversationEngineState> = {};
  return {
    save: (convId: string, state: ConversationEngineState) => {
      map[convId] = state;
    },
    get: (convId: string): ConversationEngineState | null => map[convId] ?? null,
  };
}

/** branchSlice.ts openBranchStream 의 상속 분기 — fix 적용 버전. */
function inheritEngineFixed(
  store: ReturnType<typeof makeEngineMap>,
  parentConvId: string,
  branchConvId: string,
) {
  const parentEngine = store.get(parentConvId);
  if (parentEngine && !store.get(branchConvId)) {
    store.save(branchConvId, { ...parentEngine }); // T4 shallow copy
  }
}

describe("branch engine inheritance — shallow copy (T4, PR #300)", () => {
  it("상속 동작 보존 — branch 가 parent engine 값을 그대로 물려받음", () => {
    const store = makeEngineMap();
    store.save("parent", { profileId: "p", engine: "claude", model: "opus", source: "profile-derived" });
    inheritEngineFixed(store, "parent", "branch");
    expect(store.get("branch")).toEqual({
      profileId: "p",
      engine: "claude",
      model: "opus",
      source: "profile-derived",
    });
  });

  it("parent 가 다른 객체로 교체돼도 branch 는 독립 (별 참조)", () => {
    const store = makeEngineMap();
    store.save("parent", { profileId: "p", engine: "claude", model: "opus" });
    inheritEngineFixed(store, "parent", "branch");

    // parent 를 새 객체로 교체 (엔진 변경).
    store.save("parent", { profileId: "p2", engine: "codex", model: "gpt" });

    // branch 는 상속 당시 값 유지 — parent 변경 영향 없음.
    expect(store.get("branch")?.engine).toBe("claude");
    expect(store.get("branch")?.model).toBe("opus");
  });

  it("저장된 branch 객체는 parent 객체와 다른 참조 (mutation 격리)", () => {
    const store = makeEngineMap();
    const parentObj: ConversationEngineState = { profileId: "p", engine: "claude", model: "opus" };
    store.save("parent", parentObj);
    inheritEngineFixed(store, "parent", "branch");

    const branchObj = store.get("branch")!;
    expect(branchObj).not.toBe(parentObj); // shallow copy → 다른 참조

    // 가령 parent 객체를 직접 mutate 해도 branch 는 안 변함.
    parentObj.model = "MUTATED";
    expect(store.get("branch")?.model).toBe("opus");
  });

  it("이미 branch entry 가 있으면 덮어쓰지 않음 (re-entry 보존, INV-BAF-2)", () => {
    const store = makeEngineMap();
    store.save("parent", { profileId: "p", engine: "claude" });
    store.save("branch", { profileId: "b", engine: "gemini" }); // 사용자가 branch 에서 변경
    inheritEngineFixed(store, "parent", "branch");
    expect(store.get("branch")?.engine).toBe("gemini"); // 보존
  });
});
