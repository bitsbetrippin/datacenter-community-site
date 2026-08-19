import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useHousehold } from "../context/HouseholdContext";
import type { EventRecurrence, EventRow } from "../lib/types";
import { readableForeground, toDateInputValue } from "../lib/eventUtils";
import { expandOccurrences } from "../lib/recurrence";

interface DayEvents {
  date: Date;
  inMonth: boolean;
  items: { title: string; time: string | null; color: string }[];
}

/**
 * High-fidelity month export (project goal: razor-sharp PDF & PPT).
 *   PDF — the view below is print-optimized vector output; the PDF button
 *         opens the browser's print dialog (choose "Save as PDF", Landscape).
 *   PPT — generates a real .pptx (one slide per month) via pptxgenjs.
 */
export function ExportPage() {
  const { household, categories, calendars } = useHousehold();
  const [params, setParams] = useSearchParams();
  const [days, setDays] = useState<DayEvents[]>([]);
  const [busyPpt, setBusyPpt] = useState(false);

  const monthStr = params.get("month") ?? toDateInputValue(new Date()).slice(0, 7);
  const [year, month] = monthStr.split("-").map(Number);
  const calFilter = params.get("cal") ?? "";

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const weekStart = household?.week_start ?? 0;

  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() - weekStart + 7) % 7;
    const gridStart = new Date(year, month - 1, 1 - offset);
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
    }
    return cells;
  }, [year, month, weekStart]);

  const load = useCallback(async () => {
    if (!household) return;
    const rangeStart = grid[0];
    const rangeEnd = new Date(grid[41].getFullYear(), grid[41].getMonth(), grid[41].getDate() + 1);
    let q = supabase
      .from("events")
      .select("*")
      .eq("household_id", household.id)
      .is("deleted_at", null)
      .or(
        `and(all_day.eq.false,start_at.lt.${rangeEnd.toISOString()},end_at.gt.${rangeStart.toISOString()}),` +
          `and(all_day.eq.true,start_date.lt.${toDateInputValue(rangeEnd)},end_date_exclusive.gt.${toDateInputValue(rangeStart)})`,
      );
    if (calFilter) q = q.eq("calendar_id", calFilter);
    let rq = supabase
      .from("event_recurrence")
      .select("*, events!inner(*)")
      .eq("household_id", household.id)
      .is("events.deleted_at", null);
    if (calFilter) rq = rq.in("events.calendar_id", [calFilter]);
    const [plain, rec] = await Promise.all([q.limit(1500), rq]);

    const recRows = ((rec.data as unknown as (EventRecurrence & { events: EventRow })[]) ?? []);
    const masterIds = new Set(recRows.map((r) => r.event_id));
    const fmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

    interface Occ { date: string; title: string; time: string | null; color: string; sort: number }
    const occs: Occ[] = [];
    const colorOf = (row: EventRow) =>
      (row.category_id ? categoriesById.get(row.category_id)?.color : null) ?? "#64748b";

    for (const row of ((plain.data as EventRow[]) ?? [])) {
      if (masterIds.has(row.id)) continue;
      if (row.all_day) {
        // repeat across covered days
        let d = row.start_date!;
        while (d < row.end_date_exclusive!) {
          occs.push({ date: d, title: row.title, time: null, color: colorOf(row), sort: -1 });
          const dt = new Date(`${d}T00:00:00`);
          dt.setDate(dt.getDate() + 1);
          d = toDateInputValue(dt);
        }
      } else {
        const s = new Date(row.start_at!);
        occs.push({
          date: toDateInputValue(s), title: row.title, time: fmt.format(s),
          color: colorOf(row), sort: s.getHours() * 60 + s.getMinutes(),
        });
      }
    }
    for (const r of recRows) {
      const master = r.events;
      for (const occ of expandOccurrences(r.rrule, r.exdates, rangeStart, rangeEnd)) {
        occs.push({
          date: toDateInputValue(occ),
          title: master.title,
          time: master.all_day ? null : fmt.format(occ),
          color: colorOf(master),
          sort: master.all_day ? -1 : occ.getHours() * 60 + occ.getMinutes(),
        });
      }
    }

    const byDate = new Map<string, Occ[]>();
    for (const o of occs) {
      if (!byDate.has(o.date)) byDate.set(o.date, []);
      byDate.get(o.date)!.push(o);
    }
    setDays(
      grid.map((d) => {
        const key = toDateInputValue(d);
        const items = (byDate.get(key) ?? [])
          .sort((a, b) => a.sort - b.sort)
          .map((o) => ({ title: o.title, time: o.time, color: o.color }));
        return { date: d, inMonth: d.getMonth() === month - 1, items };
      }),
    );
  }, [household, grid, month, calFilter, categoriesById]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthName = new Intl.DateTimeFormat(undefined, {
    month: "long", year: "numeric",
  }).format(new Date(year, month - 1, 1));

  const dayNames = useMemo(() => {
    const base = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return [...Array(7)].map((_, i) => base[(i + weekStart) % 7]);
  }, [weekStart]);

  async function downloadPptx() {
    setBusyPpt(true);
    try {
      const PptxGen = (await import("pptxgenjs")).default;
      const pptx = new PptxGen();
      pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
      pptx.layout = "WIDE";
      const slide = pptx.addSlide();
      slide.addText(`${household?.name ?? "Family"} — ${monthName}`, {
        x: 0.4, y: 0.15, w: 12.5, h: 0.6, fontSize: 26, bold: true, color: "1B1F27",
      });
      type Row = { text: string; options?: Record<string, unknown> }[][] | never;
      const header = dayNames.map((d) => ({
        text: d,
        options: { bold: true, color: "FFFFFF", fill: { color: "3B5BDB" }, align: "center", fontSize: 12 },
      }));
      const rows: Row[] = [header as unknown as Row];
      for (let w = 0; w < 6; w++) {
        const row = [] as unknown as Row;
        for (let d = 0; d < 7; d++) {
          const cell = days[w * 7 + d];
          if (!cell) continue;
          const runs: { text: string; options: Record<string, unknown> }[] = [
            {
              text: `${cell.date.getDate()}\n`,
              options: { bold: true, fontSize: 12, color: cell.inMonth ? "1B1F27" : "AAB0BC" },
            },
          ];
          for (const item of cell.items.slice(0, 5)) {
            runs.push({
              text: `${item.time ? item.time + " " : ""}${item.title}\n`,
              options: { fontSize: 8.5, color: item.color.replace("#", ""), breakLine: true },
            });
          }
          if (cell.items.length > 5) {
            runs.push({ text: `+${cell.items.length - 5} more`, options: { fontSize: 8, italic: true, color: "667085" } });
          }
          (row as unknown as unknown[]).push({
            text: runs,
            options: {
              valign: "top",
              fill: { color: cell.inMonth ? "FFFFFF" : "F3F4F8" },
              border: { type: "solid", color: "D9DEE9", pt: 0.75 },
            },
          });
        }
        rows.push(row);
      }
      slide.addTable(rows as never, {
        x: 0.4, y: 0.85, w: 12.5, h: 6.3,
        rowH: [0.32, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        colW: Array(7).fill(12.5 / 7),
      });
      await pptx.writeFile({ fileName: `${household?.name ?? "calendar"}-${monthStr}.pptx` });
    } finally {
      setBusyPpt(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const p = new URLSearchParams(params);
    p.set("month", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setParams(p, { replace: true });
  }

  if (!household) return null;

  return (
    <div className="export-page">
      <div className="export-toolbar no-print">
        <Link to="/" className="btn">← Back to calendar</Link>
        <div className="row">
          <button className="btn" onClick={() => shiftMonth(-1)}>‹ Prev</button>
          <strong className="export-month-label">{monthName}</strong>
          <button className="btn" onClick={() => shiftMonth(1)}>Next ›</button>
        </div>
        <select
          value={calFilter}
          aria-label="Calendar filter"
          onChange={(e) => {
            const p = new URLSearchParams(params);
            e.target.value ? p.set("cal", e.target.value) : p.delete("cal");
            setParams(p, { replace: true });
          }}
        >
          <option value="">All calendars</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="row">
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨 PDF / Print
          </button>
          <button className="btn btn-primary" disabled={busyPpt} onClick={() => void downloadPptx()}>
            {busyPpt ? "Building…" : "⬇ PowerPoint"}
          </button>
        </div>
      </div>
      <p className="muted small no-print">
        PDF: in the print dialog choose “Save as PDF” and Landscape orientation —
        the output is true vector, razor-sharp at any size.
      </p>

      <div className="export-sheet">
        <h1 className="export-title">{household.name} — {monthName}</h1>
        <div className="export-grid">
          {dayNames.map((d) => (
            <div key={d} className="export-dayname">{d}</div>
          ))}
          {days.map((cell, i) => (
            <div key={i} className={`export-cell ${cell.inMonth ? "" : "outside"}`}>
              <div className="export-daynum">{cell.date.getDate()}</div>
              {cell.items.slice(0, 6).map((it, j) => (
                <div key={j} className="export-event">
                  <span
                    className="export-dot"
                    style={{ background: it.color, color: readableForeground(it.color) }}
                  />
                  <span className="export-event-text">
                    {it.time && <span className="export-time">{it.time} </span>}
                    {it.title}
                  </span>
                </div>
              ))}
              {cell.items.length > 6 && (
                <div className="export-more">+{cell.items.length - 6} more</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
