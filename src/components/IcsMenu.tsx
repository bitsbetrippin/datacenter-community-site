import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, canCreateEvents } from "../context/HouseholdContext";
import type { EventRecurrence, EventRow } from "../lib/types";
import { toDateInputValue } from "../lib/eventUtils";
import { buildIcs, downloadIcs, parseIcs, type ImportedEvent } from "../lib/ics";

interface Props {
  onImported: () => void;
}

interface PreviewItem extends ImportedEvent {
  duplicate: boolean;
  include: boolean;
}

/** §12 — ICS import with preview + duplicate detection; ICS export; print. */
export function IcsMenu({ onImported }: Props) {
  const { household, role, calendars } = useHousehold();
  const { user } = useAuth();
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);
  const [importCalendar, setImportCalendar] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [exportCalendar, setExportCalendar] = useState("");
  const [exportFrom, setExportFrom] = useState(
    toDateInputValue(new Date(new Date().getFullYear(), 0, 1)),
  );
  const [exportTo, setExportTo] = useState(
    toDateInputValue(new Date(new Date().getFullYear() + 1, 0, 1)),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (!household) return;
    setMessage(null);
    let parsed: ImportedEvent[];
    try {
      parsed = parseIcs(await file.text());
    } catch {
      setMessage("That file could not be read as an iCalendar (.ics) file.");
      return;
    }
    if (parsed.length === 0) {
      setMessage("No events found in that file.");
      return;
    }
    // Duplicate detection: same title + same start already in the household.
    const withDup: PreviewItem[] = [];
    for (const p of parsed.slice(0, 500)) {
      let q = supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("household_id", household.id)
        .is("deleted_at", null)
        .eq("title", p.title);
      q = p.allDay
        ? q.eq("start_date", p.startDate!)
        : q.eq("start_at", p.startAt!);
      const { count } = await q;
      const duplicate = (count ?? 0) > 0;
      withDup.push({ ...p, duplicate, include: !duplicate });
    }
    setImportCalendar(calendars.find((c) => c.is_default)?.id ?? calendars[0]?.id ?? "");
    setPreview(withDup);
  }

  async function runImport() {
    if (!household || !user || !preview) return;
    setBusy(true);
    let imported = 0;
    for (const p of preview.filter((x) => x.include)) {
      const { data, error } = await supabase
        .from("events")
        .insert({
          household_id: household.id,
          calendar_id: importCalendar,
          title: p.title.slice(0, 200),
          description: p.description,
          location_text: p.location,
          all_day: p.allDay,
          start_at: p.startAt,
          end_at: p.endAt,
          start_date: p.startDate,
          end_date_exclusive: p.endDateExclusive,
          timezone: household.timezone,
          created_by: user.id,
          organizer_user_id: user.id,
          updated_by: user.id,
        })
        .select("id")
        .single();
      if (!error && data) {
        imported++;
        if (p.rrule) {
          await supabase.from("event_recurrence").insert({
            household_id: household.id,
            event_id: (data as { id: string }).id,
            rrule: p.rrule,
          });
        }
      }
    }
    setBusy(false);
    setPreview(null);
    setMessage(`Imported ${imported} event${imported === 1 ? "" : "s"}.`);
    onImported();
  }

  async function runExport() {
    if (!household) return;
    setBusy(true);
    const fromIso = new Date(`${exportFrom}T00:00:00`).toISOString();
    const toIso = new Date(`${exportTo}T23:59:59`).toISOString();
    let q = supabase
      .from("events")
      .select("*")
      .eq("household_id", household.id)
      .is("deleted_at", null)
      .or(
        `and(all_day.eq.false,start_at.gte.${fromIso},start_at.lte.${toIso}),` +
          `and(all_day.eq.true,start_date.gte.${exportFrom},start_date.lte.${exportTo})`,
      )
      .limit(5000);
    if (exportCalendar) q = q.eq("calendar_id", exportCalendar);
    const { data } = await q;
    const rows = (data as EventRow[]) ?? [];
    const { data: recData } = await supabase
      .from("event_recurrence")
      .select("*")
      .eq("household_id", household.id);
    const recMap = new Map(
      ((recData as EventRecurrence[]) ?? []).map((r) => [r.event_id, r]),
    );
    const calName =
      calendars.find((c) => c.id === exportCalendar)?.name ?? household.name;
    downloadIcs(buildIcs(rows, recMap, calName), `${calName.replace(/\s+/g, "-")}.ics`);
    setBusy(false);
    setShowExport(false);
  }

  return (
    <>
      <details className="filter-pop ics-menu">
        <summary className="btn" aria-label="More actions">⋯</summary>
        <div className="filter-panel">
          {canCreateEvents(role) && (
            <button
              type="button"
              className="suggestion"
              onClick={() => fileInput.current?.click()}
            >
              ⬆ Import .ics file…
            </button>
          )}
          <button type="button" className="suggestion" onClick={() => setShowExport(true)}>
            ⬇ Export .ics…
          </button>
          <button type="button" className="suggestion" onClick={() => window.print()}>
            🖨 Print view
          </button>
        </div>
      </details>
      <input
        ref={fileInput}
        type="file"
        accept=".ics,text/calendar"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />

      {message && (
        <span className="muted small" role="status">{message}</span>
      )}

      {preview && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="Import preview">
            <div className="modal-head">
              <h2>Import preview</h2>
              <button className="btn btn-ghost" onClick={() => setPreview(null)}>✕</button>
            </div>
            <p className="muted small">
              {preview.length} event{preview.length === 1 ? "" : "s"} found.
              Duplicates (same title and start) are unchecked automatically.
            </p>
            <label>
              Import into calendar
              <select value={importCalendar} onChange={(e) => setImportCalendar(e.target.value)}>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <div className="import-list">
              {preview.map((p, i) => (
                <label key={i} className="check-row">
                  <input
                    type="checkbox"
                    checked={p.include}
                    onChange={() => {
                      const next = [...preview];
                      next[i] = { ...p, include: !p.include };
                      setPreview(next);
                    }}
                  />
                  <span>
                    {p.title}
                    <span className="muted small">
                      {" · "}
                      {p.allDay ? p.startDate : new Date(p.startAt!).toLocaleString()}
                      {p.rrule ? " · repeats" : ""}
                      {p.duplicate ? " · possible duplicate" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setPreview(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void runImport()}>
                {busy ? "Importing…" : `Import ${preview.filter((p) => p.include).length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <div className="modal-backdrop">
          <div className="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Export">
            <div className="modal-head">
              <h2>Export .ics</h2>
              <button className="btn btn-ghost" onClick={() => setShowExport(false)}>✕</button>
            </div>
            <div className="stack">
              <label>
                Calendar
                <select value={exportCalendar} onChange={(e) => setExportCalendar(e.target.value)}>
                  <option value="">All calendars</option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <div className="row">
                <label>
                  From
                  <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
                </label>
                <label>
                  To
                  <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
                </label>
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setShowExport(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => void runExport()}>
                  {busy ? "Exporting…" : "Download .ics"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
