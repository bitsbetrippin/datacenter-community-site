import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useHousehold, isAdmin } from "../context/HouseholdContext";
import type { Category } from "../lib/types";
import { readableForeground } from "../lib/eventUtils";

const NEW_GROUP = "__new__";

/**
 * §9 admin category editor (CAT-001) — v1.0 layout:
 *   * Add form lives at the TOP, with named custom groups (pick an existing
 *     group or create a new one and label it yourself).
 *   * Each group is a collapsible section with a count badge.
 */
export function CategoriesPage() {
  const { household, role, refresh } = useHousehold();
  const [cats, setCats] = useState<Category[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newName, setNewName] = useState("");
  const [groupChoice, setGroupChoice] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newColor, setNewColor] = useState("#3b5bdb");
  const [mergeSource, setMergeSource] = useState<Category | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  async function load() {
    if (!household) return;
    const { data } = await supabase
      .from("categories")
      .select("id, household_id, name, slug, color, foreground, group_name, sort_order, active")
      .eq("household_id", household.id)
      .order("sort_order");
    setCats((data as Category[]) ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household?.id]);

  const groupNames = useMemo(
    () => [...new Set(cats.map((c) => c.group_name ?? "Other"))],
    [cats],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of cats) {
      if (!includeInactive && !c.active) continue;
      const key = c.group_name ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [cats, includeInactive]);

  if (!household || !isAdmin(role)) {
    return <p className="muted">Categories are managed by the Owner or an Admin.</p>;
  }

  async function patch(id: string, fields: Partial<Category>) {
    await supabase.from("categories").update(fields).eq("id", id);
    await load();
    await refresh();
  }

  async function move(c: Category, dir: -1 | 1) {
    const siblings = cats
      .filter((x) => (x.group_name ?? "Other") === (c.group_name ?? "Other"))
      .sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((x) => x.id === c.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    await Promise.all([
      supabase.from("categories").update({ sort_order: swap.sort_order }).eq("id", c.id),
      supabase.from("categories").update({ sort_order: c.sort_order }).eq("id", swap.id),
    ]);
    await load();
    await refresh();
  }

  async function addCategory(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const groupName =
      groupChoice === NEW_GROUP ? newGroupName.trim() : groupChoice;
    if (!groupName) {
      setMsg("Pick a group, or create and name a new one.");
      return;
    }
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const maxOrder = Math.max(100, ...cats.map((c) => c.sort_order));
    const { error } = await supabase.from("categories").insert({
      household_id: household!.id,
      name: newName.trim(),
      slug: slug || `cat-${maxOrder + 1}`,
      color: newColor,
      group_name: groupName,
      sort_order: maxOrder + 1,
    });
    setMsg(error ? "Could not add category (name may already exist)." : `Added to "${groupName}".`);
    setNewName("");
    if (groupChoice === NEW_GROUP) {
      setGroupChoice(groupName); // keep adding into the newly created group
      setNewGroupName("");
    }
    setOpenGroups((s) => new Set(s).add(groupName));
    await load();
    await refresh();
  }

  async function runMerge() {
    if (!mergeSource || !mergeTarget) return;
    const { error } = await supabase
      .from("events")
      .update({ category_id: mergeTarget })
      .eq("household_id", household!.id)
      .eq("category_id", mergeSource.id);
    if (!error) {
      await supabase.from("categories").update({ active: false }).eq("id", mergeSource.id);
      setMsg(`Merged "${mergeSource.name}" into the selected category.`);
    } else {
      setMsg("Merge failed. Please try again.");
    }
    setMergeSource(null);
    setMergeTarget("");
    await load();
    await refresh();
  }

  function toggleGroup(name: string, open: boolean) {
    setOpenGroups((s) => {
      const next = new Set(s);
      open ? next.add(name) : next.delete(name);
      return next;
    });
  }

  return (
    <div className="settings-page stack-lg">
      <h1>Categories</h1>

      {/* ---- Add — now at the top, with named custom groups ---- */}
      <section className="card">
        <h2>Add a category</h2>
        <form onSubmit={addCategory} className="row row-end">
          <label>
            Name
            <input value={newName} onChange={(e) => setNewName(e.target.value)} required />
          </label>
          <label>
            Group
            <select
              value={groupChoice}
              onChange={(e) => setGroupChoice(e.target.value)}
              required
            >
              <option value="">Choose a group…</option>
              {groupNames.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value={NEW_GROUP}>＋ New group…</option>
            </select>
          </label>
          {groupChoice === NEW_GROUP && (
            <label>
              New group name
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Scouts & Clubs"
                required
              />
            </label>
          )}
          <label>
            Color
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
          </label>
          <button className="btn btn-primary">Add</button>
        </form>
        {msg && <p className="form-ok" role="status">{msg}</p>}
      </section>

      <label className="check-row">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
        />
        Show archived categories
      </label>

      {/* ---- Collapsible groups ---- */}
      {[...groups.entries()].map(([group, list]) => (
        <details
          key={group}
          className="card group-card"
          open={openGroups.has(group)}
          onToggle={(e) => toggleGroup(group, e.currentTarget.open)}
        >
          <summary className="group-summary">
            <span className="group-title">{group}</span>
            <span className="group-count">{list.length}</span>
            <span className="group-swatches" aria-hidden>
              {list.slice(0, 8).map((c) => (
                <span key={c.id} className="cat-bubble small" style={{ background: c.color }} />
              ))}
            </span>
          </summary>
          <ul className="plain-list group-body">
            {list.map((c) => (
              <li key={c.id} className="category-row">
                <input
                  type="color"
                  value={c.color}
                  aria-label={`Color for ${c.name}`}
                  onChange={(e) => void patch(c.id, { color: e.target.value })}
                />
                <input
                  className="category-name"
                  defaultValue={c.name}
                  aria-label="Category name"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) void patch(c.id, { name: v });
                  }}
                />
                <span
                  className="chip"
                  style={{ background: c.color, color: readableForeground(c.color) }}
                >
                  preview
                </span>
                <div className="category-actions">
                  <button className="btn btn-ghost" aria-label="Move up" onClick={() => void move(c, -1)}>↑</button>
                  <button className="btn btn-ghost" aria-label="Move down" onClick={() => void move(c, 1)}>↓</button>
                  <button className="btn btn-ghost" onClick={() => setMergeSource(c)}>Merge…</button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => void patch(c.id, { active: !c.active })}
                  >
                    {c.active ? "Archive" : "Restore"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {mergeSource && (
        <div className="modal-backdrop">
          <div className="modal modal-narrow" role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>Merge “{mergeSource.name}”</h2>
              <button className="btn btn-ghost" onClick={() => setMergeSource(null)}>✕</button>
            </div>
            <p className="muted small">
              Every event using “{mergeSource.name}” will be moved to the category
              you pick, then “{mergeSource.name}” is archived.
            </p>
            <label>
              Merge into
              <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                <option value="">Choose…</option>
                {cats
                  .filter((c) => c.active && c.id !== mergeSource.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.group_name ?? "Other"})</option>
                  ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMergeSource(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={!mergeTarget} onClick={() => void runMerge()}>
                Merge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
