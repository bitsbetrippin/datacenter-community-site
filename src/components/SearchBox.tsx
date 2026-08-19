import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useHousehold } from "../context/HouseholdContext";
import type { EventRow } from "../lib/types";

interface Hit {
  row: EventRow;
  via: string;
}

/**
 * §12 global search (Must): title, description, location, people, category,
 * and attachment filename — all constrained by RLS automatically.
 */
export function SearchBox() {
  const { household, categories } = useHousehold();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const navigate = useNavigate();

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!household || q.trim().length < 2) {
      setHits([]);
      return;
    }
    timer.current = setTimeout(() => {
      void (async () => {
        const term = q.trim().replaceAll("%", "").replaceAll(",", " ");
        const like = `%${term}%`;

        const catIds = categories
          .filter((c) => c.name.toLowerCase().includes(term.toLowerCase()))
          .map((c) => c.id);

        const [direct, viaAttendee, viaFile, viaCat] = await Promise.all([
          supabase
            .from("events")
            .select("*")
            .eq("household_id", household.id)
            .is("deleted_at", null)
            .or(`title.ilike.${like},description.ilike.${like},location_text.ilike.${like}`)
            .limit(10),
          supabase
            .from("event_attendees")
            .select("event_id, display_name")
            .eq("household_id", household.id)
            .ilike("display_name", like)
            .limit(10),
          supabase
            .from("event_attachments")
            .select("event_id, original_filename")
            .eq("household_id", household.id)
            .ilike("original_filename", like)
            .limit(10),
          catIds.length
            ? supabase
                .from("events")
                .select("*")
                .eq("household_id", household.id)
                .is("deleted_at", null)
                .in("category_id", catIds)
                .limit(10)
            : Promise.resolve({ data: [] as EventRow[] }),
        ]);

        const out = new Map<string, Hit>();
        for (const row of ((direct.data as EventRow[]) ?? [])) {
          out.set(row.id, { row, via: "" });
        }
        const indirect: { id: string; via: string }[] = [
          ...(((viaAttendee.data as { event_id: string; display_name: string }[]) ?? []).map(
            (r) => ({ id: r.event_id, via: `person: ${r.display_name}` }),
          )),
          ...(((viaFile.data as { event_id: string; original_filename: string }[]) ?? []).map(
            (r) => ({ id: r.event_id, via: `file: ${r.original_filename}` }),
          )),
        ];
        const missing = indirect.filter((i) => !out.has(i.id));
        if (missing.length) {
          const { data } = await supabase
            .from("events")
            .select("*")
            .in("id", missing.map((m) => m.id))
            .is("deleted_at", null);
          for (const row of ((data as EventRow[]) ?? [])) {
            out.set(row.id, {
              row,
              via: missing.find((m) => m.id === row.id)?.via ?? "",
            });
          }
        }
        for (const row of ((viaCat.data as EventRow[]) ?? [])) {
          if (!out.has(row.id)) out.set(row.id, { row, via: "category" });
        }
        setHits([...out.values()].slice(0, 12));
        setOpen(true);
      })();
    }, 250);
  }, [q, household, categories]);

  function openHit(h: Hit) {
    setOpen(false);
    setQ("");
    const date = h.row.all_day ? h.row.start_date : h.row.start_at?.slice(0, 10);
    navigate(`/?event=${h.row.id}${date ? `&date=${date}` : ""}`);
  }

  return (
    <div className="search-wrap no-print">
      <input
        id="global-search"
        className="search-input"
        placeholder="Search events…  ( / )"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        aria-label="Search events"
      />
      {open && hits.length > 0 && (
        <div className="menu-pop search-pop">
          {hits.map((h) => (
            <button key={h.row.id} className="bell-item" onMouseDown={() => openHit(h)}>
              <span className="bell-title">{h.row.title}</span>
              <span className="muted small">
                {h.row.all_day
                  ? h.row.start_date
                  : new Date(h.row.start_at!).toLocaleString()}
                {h.via ? ` · ${h.via}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
