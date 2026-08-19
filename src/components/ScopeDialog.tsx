export type EditScope = "occurrence" | "series" | "future";

interface Props {
  title: string;
  verb: "edit" | "delete";
  /** hide the "this and future" option (rules with COUNT can't be split) */
  allowFuture: boolean;
  onPick: (scope: EditScope) => void;
  onCancel: () => void;
}

/**
 * EVT-003 — recurring events prompt for this occurrence, this and future,
 * or the entire series. Series edits never clobber existing exceptions.
 */
export function ScopeDialog({ title, verb, allowFuture, onPick, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal modal-narrow" role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{verb === "edit" ? "Edit" : "Delete"} repeating event</h2>
        </div>
        <p className="muted">“{title}” repeats. What should this change apply to?</p>
        <div className="stack">
          <button className="btn" onClick={() => onPick("occurrence")}>
            This event only
          </button>
          {allowFuture && (
            <button className="btn" onClick={() => onPick("future")}>
              This and all future events
            </button>
          )}
          <button className="btn" onClick={() => onPick("series")}>
            The entire series
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
