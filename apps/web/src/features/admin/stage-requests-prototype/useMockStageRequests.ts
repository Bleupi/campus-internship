// PROTOTYPE — in-memory store shared by all variants (so state survives a
// variant switch). Mimics the real rules: referent derived from the
// four-tuple assignment (ADR-0014), validation blocked without one (BR-03),
// stale-version conflict (BR-09).
import { useState } from "react";
import {
  assignmentKey,
  SEED_ASSIGNMENTS,
  SEED_REFERENTS,
  SEED_REQUESTS,
  type MockReferent,
  type MockStageRequest,
} from "./mock-data";

export type DecisionResult = { ok: true } | { ok: false; error: "CONFLICT" | "NO_REFERENT" };

export interface NewReferentInput {
  firstName: string;
  lastName: string;
  email: string;
}

export function useMockStageRequests(startWithoutReferents: boolean) {
  const [requests, setRequests] = useState(SEED_REQUESTS);
  const [referents, setReferents] = useState<MockReferent[]>(
    startWithoutReferents ? [] : SEED_REFERENTS,
  );
  const [assignments, setAssignments] = useState<Record<string, string>>(
    startWithoutReferents ? {} : SEED_ASSIGNMENTS,
  );
  const [toast, setToast] = useState<string | null>(null);

  function referentOf(request: MockStageRequest): MockReferent | null {
    if (request.status !== "PENDING") return request.frozenReferent ?? null;
    const referentId = assignments[assignmentKey(request)];
    return referents.find((r) => r.id === referentId) ?? null;
  }

  function addReferent(input: NewReferentInput): MockReferent {
    const created = { id: `ref-${Date.now()}`, ...input };
    setReferents((prev) => [...prev, created]);
    return created;
  }

  // In-place UPDATE of the tuple's row: every live stage sharing the tuple
  // sees the new referent (ADR-0014).
  function assignReferent(targets: MockStageRequest[], referentId: string) {
    setAssignments((prev) => {
      const next = { ...prev };
      targets.forEach((t) => {
        next[assignmentKey(t)] = referentId;
      });
      return next;
    });
  }

  function settle(
    ids: string[],
    status: "VALIDATED" | "REFUSED",
    refusalReason?: string,
  ): { done: string[]; conflict: string[]; noReferent: string[] } {
    const done: string[] = [];
    const conflict: string[] = [];
    const noReferent: string[] = [];
    const patches = new Map<string, Partial<MockStageRequest>>();
    ids.forEach((id) => {
      const request = requests.find((r) => r.id === id);
      if (!request || request.status !== "PENDING") return;
      if (request.staleOnce) {
        conflict.push(id);
        patches.set(id, { staleOnce: false, version: request.version + 1 });
        return;
      }
      const referent = referentOf(request);
      // Referent required for validation AND refusal (BR-03, extended).
      if (!referent) {
        noReferent.push(id);
        return;
      }
      done.push(id);
      patches.set(id, {
        status,
        version: request.version + 1,
        refusalReason,
        frozenReferent: referent,
      });
    });
    setRequests((prev) =>
      prev.map((r) => (patches.has(r.id) ? { ...r, ...patches.get(r.id) } : r)),
    );
    return { done, conflict, noReferent };
  }

  function validate(id: string): DecisionResult {
    const { conflict, noReferent } = settle([id], "VALIDATED");
    if (conflict.length) {
      setToast("Cette demande a été modifiée par un autre administrateur, rechargez-la.");
      return { ok: false, error: "CONFLICT" };
    }
    if (noReferent.length) {
      setToast("Assignez un référent avant de traiter cette demande.");
      return { ok: false, error: "NO_REFERENT" };
    }
    setToast("Demande validée — l'étudiant est notifié.");
    return { ok: true };
  }

  function refuse(id: string, reason: string): DecisionResult {
    const { conflict } = settle([id], "REFUSED", reason);
    if (conflict.length) {
      setToast("Cette demande a été modifiée par un autre administrateur, rechargez-la.");
      return { ok: false, error: "CONFLICT" };
    }
    setToast("Demande refusée — l'étudiant reçoit le motif par email.");
    return { ok: true };
  }

  // What assigning `referent` to `targets` would touch beyond the targets
  // themselves: other live requests of the same student sharing the tuple
  // (ADR-0014: one row per tuple), and existing different referents overwritten.
  function impactOf(targets: MockStageRequest[], referentId: string) {
    const pending = requests.filter((r) => r.status === "PENDING");
    const ids = new Set(targets.map((t) => t.id));
    const others = new Map<string, { student: string; count: number }>();
    targets.forEach((t) => {
      pending
        .filter((o) => !ids.has(o.id) && assignmentKey(o) === assignmentKey(t))
        .forEach((o) => {
          const entry = others.get(o.id);
          if (!entry)
            others.set(o.id, { student: `${t.student.firstName} ${t.student.lastName}`, count: 1 });
        });
    });
    const byStudent = new Map<string, number>();
    others.forEach((v) => byStudent.set(v.student, (byStudent.get(v.student) ?? 0) + 1));
    const overwrites = new Set(
      targets
        .filter((t) => {
          const cur = referentOf(t);
          return cur && cur.id !== referentId;
        })
        .map(assignmentKey),
    ).size;
    return { others: [...byStudent].map(([student, count]) => ({ student, count })), overwrites };
  }

  return {
    requests,
    pending: requests.filter((r) => r.status === "PENDING"),
    referents,
    referentOf,
    addReferent,
    assignReferent,
    validate,
    refuse,
    impactOf,
    toast,
    clearToast: () => setToast(null),
  };
}

export type StageRequestsStore = ReturnType<typeof useMockStageRequests>;
