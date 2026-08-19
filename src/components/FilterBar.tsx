import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import type { SavedFilter } from "../lib/types";

export interface FilterState {
  categoryIds: string[];
  calendarIds: string[];
  /** "m:<user_id>" for a member or "p:<person_id>" for a contact */
  person: string | null;
}

interface FilterBarProps {
  value: FilterState;
  onChange: (next: FilterState) => void;
}

/**
 * CAL-002 — filter by person, category, and local calendar; PPL-002 per-person
 * filtering; §12 saved filters. Selections live in the URL for bookmarking.
 */
export function FilterBar({ value, onChange }: FilterBarProps) {
  const { categories, calendars, members, people } = useHousehold();
  const { user } = useAuth();
  const [saved, setSaved] = useState<SavedFilter[] | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof categories>();
    for (const c of categories) {
      const key = c.group_name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [categories]);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const active =
    value.categoryIds.length + value.calendarIds.length + (value.person ? 1 : 0);

  async function loadSaved(): Promise<SavedFilter[]> {
    if (saved) return saved;
    const { data } = await supabase
      .from("user_preferences")
      .select("filters")
      .eq("user_id", user!.id)
      .maybeSingle();
    const list =
      ((data?.filters as { saved?: SavedFilter[] } | null)?.saved as SavedFilter[]) ?? [];
    setSaved(list);
    return list;
  }

  async function persistSaved(list: SavedFilter[]) {
    setSaved(list);
    await supabase
      .from("user_preferences")
      .upsert({ user_id: user!.id, filters: { saved: list } });
  }

  async function saveCurrent() {
    const name = window.prompt("Name this filter (e.g. Kids + School):");
    if (!name) return;
    const list = await loadSaved();
    const next = [
      ...list.filter((f) => f.name !== name),
      { name, cats: value.categoryIds, cals: value.calendarIds, person: value.person },
    ];
    await persistSaved(next);
  }

  return (
    <div className="filterbar">
      <details className="filter-pop">
        <summary className="btn">
          People{value.person ? " (1)" : ""}
        </summary>
        <div className="filter-panel">
          <label className="check-row">
            <input
              type="radio"
              name="personfilter"
              checked={value.person === null}
              onChange={() => onChange({ ...value, person: null })}
            />
            Everyone
          </label>
          <div className="filter-group-title">Family</div>
          {members.map((m) => (
            <label key={m.user_id} className="check-row">
              <input
                type="radio"
                name="personfilter"
                checked={value.person === `m:${m.user_id}`}
                onChange={() => onChange({ ...value, person: `m:${m.user_id}` })}
              />
              {m.profiles?.display_name ?? m.profiles?.email}
            </label>
          ))}
          {people.filter((p) => !p.member_user_id).length > 0 && (
            <div className="filter-group-title">Contacts</div>
          )}
          {people
            .filter((p) => !p.member_user_id)
            .map((p) => (
              <label key={p.id} className="check-row">
                <input
                  type="radio"
                  name="personfilter"
                  checked={value.person === `p:${p.id}`}
                  onChange={() => onChange({ ...value, person: `p:${p.id}` })}
                />
                {p.display_name}
              </label>
            ))}
        </div>
      </details>

      <details className="filter-pop">
        <summary className="btn">
          Categories{value.categoryIds.length > 0 ? ` (${value.categoryIds.length})` : ""}
        </summary>
        <div className="filter-panel">
          {[...grouped.entries()].map(([group, cats]) => (
            <div key={group} className="filter-group">
              <div className="filter-group-title">{group}</div>
              {cats.map((c) => (
                <label key={c.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={value.categoryIds.includes(c.id)}
                    onChange={() =>
                      onChange({ ...value, categoryIds: toggle(value.categoryIds, c.id) })
                    }
                  />
                  <span className="cat-bubble small" style={{ background: c.color }} />
                  {c.name}
                </label>
              ))}
            </div>
          ))}
        </div>
      </details>

      <details className="filter-pop">
        <summary className="btn">
          Calendars{value.calendarIds.length > 0 ? ` (${value.calendarIds.length})` : ""}
        </summary>
        <div className="filter-panel">
          {calendars.map((c) => (
            <label key={c.id} className="check-row">
              <input
                type="checkbox"
                checked={value.calendarIds.includes(c.id)}
                onChange={() =>
                  onChange({ ...value, calendarIds: toggle(value.calendarIds, c.id) })
                }
              />
              <span className="cat-bubble small" style={{ background: c.color }} />
              {c.name}
              {c.source !== "local" && (
                <span className="muted small">
                  {" "}· {c.source === "google" ? "Google" : c.source === "microsoft" ? "Outlook" : c.source}
                </span>
              )}
            </label>
          ))}
        </div>
      </details>

      <details className="filter-pop" onToggle={(e) => e.currentTarget.open && void loadSaved()}>
        <summary className="btn">Saved</summary>
        <div className="filter-panel">
          {(saved ?? []).length === 0 && <p className="muted small">No saved filters yet.</p>}
          {(saved ?? []).map((f) => (
            <div key={f.name} className="saved-filter-row">
              <button
                type="button"
                className="suggestion"
                onClick={() =>
                  onChange({ categoryIds: f.cats, calendarIds: f.cals, person: f.person })
                }
              >
                {f.name}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Delete saved filter ${f.name}`}
                onClick={() => void persistSaved((saved ?? []).filter((x) => x.name !== f.name))}
              >
                ✕
              </button>
            </div>
          ))}
          {active > 0 && (
            <button type="button" className="btn" onClick={() => void saveCurrent()}>
              ★ Save current filters
            </button>
          )}
        </div>
      </details>

      {active > 0 && (
        <button
          className="btn btn-ghost"
          onClick={() => onChange({ categoryIds: [], calendarIds: [], person: null })}
        >
          Clear
        </button>
      )}
    </div>
  );
}
