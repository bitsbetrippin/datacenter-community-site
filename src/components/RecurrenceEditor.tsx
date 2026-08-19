import type { RecurrenceForm } from "../lib/recurrence";

const WEEKDAYS: { n: number; label: string }[] = [
  { n: 0, label: "Mon" },
  { n: 1, label: "Tue" },
  { n: 2, label: "Wed" },
  { n: 3, label: "Thu" },
  { n: 4, label: "Fri" },
  { n: 5, label: "Sat" },
  { n: 6, label: "Sun" },
];

interface Props {
  value: RecurrenceForm;
  onChange: (next: RecurrenceForm) => void;
  /** true when editing an existing series whose rule uses COUNT (split disabled) */
  disabled?: boolean;
}

/** §10 recurrence patterns: daily/weekdays/weekly/monthly/yearly, interval, ends. */
export function RecurrenceEditor({ value, onChange, disabled }: Props) {
  const set = (patch: Partial<RecurrenceForm>) => onChange({ ...value, ...patch });

  return (
    <div className="stack recurrence-editor">
      <div className="row">
        <label>
          Repeats
          <select
            value={value.freq}
            disabled={disabled}
            onChange={(e) => set({ freq: e.target.value as RecurrenceForm["freq"] })}
          >
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Every weekday (Mon–Fri)</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {value.freq !== "none" && value.freq !== "weekdays" && (
          <label>
            Every
            <div className="interval-row">
              <input
                type="number"
                min={1}
                max={99}
                value={value.interval}
                disabled={disabled}
                onChange={(e) => set({ interval: Number(e.target.value) || 1 })}
              />
              <span className="muted">
                {value.freq === "daily" && (value.interval > 1 ? "days" : "day")}
                {value.freq === "weekly" && (value.interval > 1 ? "weeks" : "week")}
                {value.freq === "monthly" && (value.interval > 1 ? "months" : "month")}
                {value.freq === "yearly" && (value.interval > 1 ? "years" : "year")}
              </span>
            </div>
          </label>
        )}
      </div>

      {value.freq === "weekly" && (
        <div className="weekday-picks" role="group" aria-label="Days of week">
          {WEEKDAYS.map((d) => (
            <button
              key={d.n}
              type="button"
              disabled={disabled}
              className={`day-chip ${value.byweekday.includes(d.n) ? "on" : ""}`}
              onClick={() =>
                set({
                  byweekday: value.byweekday.includes(d.n)
                    ? value.byweekday.filter((x) => x !== d.n)
                    : [...value.byweekday, d.n].sort(),
                })
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {value.freq !== "none" && (
        <div className="row">
          <label>
            Ends
            <select
              value={value.ends}
              disabled={disabled}
              onChange={(e) => set({ ends: e.target.value as RecurrenceForm["ends"] })}
            >
              <option value="never">Never</option>
              <option value="count">After a number of times</option>
              <option value="until">On a date</option>
            </select>
          </label>
          {value.ends === "count" && (
            <label>
              Times
              <input
                type="number"
                min={1}
                max={999}
                value={value.count}
                disabled={disabled}
                onChange={(e) => set({ count: Number(e.target.value) || 1 })}
              />
            </label>
          )}
          {value.ends === "until" && (
            <label>
              Until
              <input
                type="date"
                value={value.until}
                disabled={disabled}
                onChange={(e) => set({ until: e.target.value })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
