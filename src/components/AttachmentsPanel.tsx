import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useHousehold, isAdmin } from "../context/HouseholdContext";
import type { EventAttachment, EventRow } from "../lib/types";

const MAX_BYTES = 25 * 1024 * 1024;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Props {
  event: EventRow;
  canUpload: boolean;
}

/**
 * §11 attachments: private bucket, short-lived signed URLs, size/MIME limits
 * enforced by the bucket configuration AND checked client-side for friendlier
 * errors. Drag-and-drop + file picker (FILE-002).
 */
export function AttachmentsPanel({ event, canUpload }: Props) {
  const { user } = useAuth();
  const { role } = useHousehold();
  const [rows, setRows] = useState<EventAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("event_attachments")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at");
    setRows((data as EventAttachment[]) ?? []);
  }, [event.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList | File[]) {
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          setError(`"${file.name}" is larger than 25 MB.`);
          continue;
        }
        const safeName = file.name.replace(/[^\w.\- ]+/g, "_");
        const path = `${event.household_id}/${event.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("attachments")
          .upload(path, file, { contentType: file.type || "application/octet-stream" });
        if (upErr) {
          setError(
            upErr.message.toLowerCase().includes("mime")
              ? `"${file.name}" has a file type that isn't allowed.`
              : `Could not upload "${file.name}".`,
          );
          continue;
        }
        const checksum = await sha256Hex(await file.arrayBuffer());
        const { error: metaErr } = await supabase.from("event_attachments").insert({
          household_id: event.household_id,
          event_id: event.id,
          uploader_id: user?.id,
          original_filename: file.name,
          storage_path: path,
          mime_type: file.type || "application/octet-stream",
          byte_size: file.size,
          checksum,
        });
        if (metaErr) {
          // keep storage consistent with metadata
          await supabase.storage.from("attachments").remove([path]);
          setError(`Could not save "${file.name}".`);
        }
      }
      await load(); // FILE-002: visible without page reload
    } finally {
      setBusy(false);
    }
  }

  async function download(a: EventAttachment) {
    // SEC-002: authorization is checked per request; URL expires quickly.
    const { data } = await supabase.storage
      .from("attachments")
      .createSignedUrl(a.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(a: EventAttachment) {
    if (!window.confirm(`Remove "${a.original_filename}"?`)) return;
    await supabase.from("event_attachments").delete().eq("id", a.id);
    await supabase.storage.from("attachments").remove([a.storage_path]);
    await load();
  }

  const canDelete = (a: EventAttachment) =>
    isAdmin(role) || a.uploader_id === user?.id;

  return (
    <div
      className={`attachments ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <div className="attachments-head">
        <h4>Attachments</h4>
        {canUpload && (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? "Uploading…" : "+ Add file"}
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => e.target.files && void upload(e.target.files)}
            />
          </>
        )}
      </div>

      {rows.length === 0 && (
        <p className="muted small">
          {canUpload ? "No files yet — drop files here or use Add file." : "No files."}
        </p>
      )}

      <ul className="plain-list">
        {rows.map((a) => (
          <li key={a.id} className="attachment-row">
            <button type="button" className="attachment-link" onClick={() => void download(a)}>
              📎 {a.original_filename}
            </button>
            <span className="muted small">{fmtBytes(a.byte_size)}</span>
            {canDelete(a) && (
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove ${a.original_filename}`}
                onClick={() => void remove(a)}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="form-error small">{error}</p>}
    </div>
  );
}
