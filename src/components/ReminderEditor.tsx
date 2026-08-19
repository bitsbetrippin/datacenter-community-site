export interface ReminderDraft {
  id?: string;
  offset_minutes: number;
  scope: "creator" | "household";
}

const PRESETS: { label: string; minutes: number }[] = [
  { label: "At event time", minutes: 0 },
  { label: "10 minutes before", minutes: 10 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "2 hours before", minutes: 120 },
  { label: "1 day before", minutes: 1440 },
  { label: "2 days before", minutes: 2880 },
  { label: "1 week before", minutes: 10080 },
];

export function describeOffset(minutes: number): string {
  const hit = PRESETS.find((p) => p.minutes === minutes);
  if (hit) return hit.label;
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}

interface Props {
  value: ReminderDraft[];
  onChange: (next: ReminderDraft[]) => void;
}

/** §10 — multiple reminders per event; per-reminder scope (just me / household). */
export function ReminderEditor({ value, onChange }: Props) {
  return (
    <div className="stack">
      {value.map((r, i) => (
        <div key={i} className="row row-end reminder-row">
          <label>
            When
            <select
              value={r.offset_minutes}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...r, offset_minutes: Number(e.target.value) };
                onChange(next);
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>{p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Notify
            <select
              value={r.scope}
              onChange={(e) => {
                const next = [...value];
                next[i] = { ...r, scope: e.target.value as ReminderDraft["scope"] };
                onChange(next);
              }}
            >
              <option value="creator">Just me</option>
              <option value="household">Whole household</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Remove reminder"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      {value.length < 5 && (
        <button
          type="button"
          className="btn btn-ghost more-toggle"
          onClick={() => onChange([...value, { offset_minutes: 30, scope: "creator" }])}
        >
          + Add reminder
        </button>
      )}
    </div>
  );
}
