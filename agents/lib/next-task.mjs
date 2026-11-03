/**
 * next-task.mjs — pure selection of the single task the drain should work on
 * (curriculum-v2-conformance CV-REQ-120). Input is the already-ready list from
 * queue-drainer's findIndependentTasks (pending + code + deps done).
 *
 * Order: FIX-* first (they repair an open PR, so exclusion never applies to
 * them), then CRITICAL -> LOW, ties by id. Tasks claimed by another are skipped.
 */
const PRIORITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function pickNextTask(ready, exclude = []) {
  const skip = new Set(exclude);
  const isFix = (t) => String(t.id).startsWith('FIX-');
  const candidates = ready.filter((t) => t.claimedBy == null && (isFix(t) || !skip.has(t.id)));
  candidates.sort((a, b) => {
    if (isFix(a) !== isFix(b)) return isFix(a) ? -1 : 1;
    const pa = PRIORITY_ORDER[a.priority] ?? PRIORITY_ORDER.MEDIUM;
    const pb = PRIORITY_ORDER[b.priority] ?? PRIORITY_ORDER.MEDIUM;
    if (pa !== pb) return pa - pb;
    return String(a.id).localeCompare(String(b.id));
  });
  return candidates[0] || null;
}
