// Select an independent, eligible batch from candidate Linear tickets. Pure; the
// in-session launcher fetches the candidates (already in the target state) via
// the Linear MCP and feeds them here, then the result goes through footprint
// estimation + partition + human confirmation.
//
// "Independent" = no dependency edge (either direction) between any two chosen
// tickets, so the batch can be worked without an implied order. Blocked-by-open
// tickets are excluded outright.

export interface BatchTicket {
  readonly id: string;
  /** Linear priority: 1 urgent .. 4 low, 0 none. */
  readonly priority: number;
  /** Manual board ordering; lower sorts earlier. */
  readonly boardOrder: number;
  /** True if blocked by a still-open ticket. */
  readonly blockedByOpen: boolean;
  /** Ids this ticket depends on. */
  readonly dependsOn: readonly string[];
}

/** Linear sort key: urgent (1) first, none (0) last, then board order. */
function rank(t: BatchTicket): readonly [number, number] {
  return [t.priority === 0 ? Number.POSITIVE_INFINITY : t.priority, t.boardOrder];
}

function dependent(a: BatchTicket, b: BatchTicket): boolean {
  return a.dependsOn.includes(b.id) || b.dependsOn.includes(a.id);
}

/** Pick up to `k` eligible tickets with no dependency edge among them (pure). */
export function selectIndependent(tickets: readonly BatchTicket[], k: number): readonly string[] {
  const eligible = tickets
    .filter((t) => !t.blockedByOpen)
    .slice()
    .sort((a, b) => {
      const [ap, ao] = rank(a);
      const [bp, bo] = rank(b);
      return ap - bp || ao - bo;
    });

  const chosen: BatchTicket[] = [];
  for (const t of eligible) {
    if (chosen.length >= k) break;
    if (chosen.some((c) => dependent(c, t))) continue;
    chosen.push(t);
  }
  return chosen.map((t) => t.id);
}
