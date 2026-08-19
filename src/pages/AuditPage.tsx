import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useHousehold, isAdmin } from "../context/HouseholdContext";
import type { AuditLogRow } from "../lib/types";

const OBJECT_LABELS: Record<string, string> = {
  household_members: "Member",
  categories: "Category",
  calendars: "Calendar",
  households: "Household",
  events: "Event",
};

/** §15 audit log — filterable admin activity (read-only; ADM-002/SEC-003). */
export function AuditPage() {
  const { household, role, members } = useHousehold();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [objectType, setObjectType] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 50;

  const load = useCallback(async () => {
    if (!household) return;
    let q = supabase
      .from("audit_logs")
      .select("*")
      .eq("household_id", household.id)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (objectType) q = q.eq("object_type", objectType);
    const { data } = await q;
    setRows((data as AuditLogRow[]) ?? []);
  }, [household, objectType, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!household || !isAdmin(role)) {
    return <p className="muted">The audit log is visible to the Owner or an Admin.</p>;
  }

  function actorName(id: string | null): string {
    if (!id) return "system";
    const m = members.find((x) => x.user_id === id);
    return m?.profiles?.display_name ?? m?.profiles?.email ?? "former member";
  }

  function describe(r: AuditLogRow): string {
    const label = OBJECT_LABELS[r.object_type] ?? r.object_type;
    const after = (r.summary as { after?: Record<string, unknown> } | null)?.after;
    const before = (r.summary as { before?: Record<string, unknown> } | null)?.before;
    const name =
      (after?.name as string) ??
      (before?.name as string) ??
      (after?.title as string) ??
      (before?.title as string) ??
      "";
    const action =
      r.action === "INSERT" ? "created" : r.action === "DELETE" ? "deleted" : "updated";
    if (r.object_type === "events" && r.action === "UPDATE") {
      const deletedAfter = after && "deleted_at" in after && after.deleted_at;
      return deletedAfter ? `deleted event “${name}”` : `restored event “${name}”`;
    }
    return `${action} ${label.toLowerCase()}${name ? ` “${name}”` : ""}`;
  }

  return (
    <div className="settings-page stack-lg">
      <h1>Audit log</h1>
      <div className="row">
        <label>
          Filter by object
          <select
            value={objectType}
            onChange={(e) => {
              setPage(0);
              setObjectType(e.target.value);
            }}
          >
            <option value="">Everything</option>
            {Object.entries(OBJECT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="muted small">{new Date(r.created_at).toLocaleString()}</td>
                <td>{actorName(r.actor)}</td>
                <td>{describe(r)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="muted">No entries.</td></tr>
            )}
          </tbody>
        </table>
        <div className="row">
          <button className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ← Newer
          </button>
          <button className="btn" disabled={rows.length < PAGE} onClick={() => setPage((p) => p + 1)}>
            Older →
          </button>
        </div>
      </section>
    </div>
  );
}
