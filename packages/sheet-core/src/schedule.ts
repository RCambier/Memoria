/**
 * The scheduling slot: a task has either a due date or a blocked-until,
 * never both. `blockedUntil` holds a `YYYY-MM-DD` date or a free-text event
 * (e.g. "Trip done"); either field is `""` when unset.
 */

export interface Schedule {
  dueDate: string;
  blockedUntil: string;
}

/**
 * Merges a partial schedule patch onto the current values, keeping the
 * either/or invariant: a patch that sets one field non-empty clears the
 * other. Explicit `""` clears just that field; `undefined` leaves it alone.
 * If a patch sets both non-empty (contradictory — the MCP tools reject it
 * up front), blocked-until wins: blocking is the more deliberate statement.
 * Total — never throws — so it's safe in the web app's projection path.
 */
export function mergeSchedule(
  current: Schedule,
  patch: { dueDate?: string; blockedUntil?: string },
): Schedule {
  if (patch.blockedUntil) return { dueDate: "", blockedUntil: patch.blockedUntil };
  if (patch.dueDate) return { dueDate: patch.dueDate, blockedUntil: "" };
  return {
    dueDate: patch.dueDate ?? current.dueDate,
    blockedUntil: patch.blockedUntil ?? current.blockedUntil,
  };
}
