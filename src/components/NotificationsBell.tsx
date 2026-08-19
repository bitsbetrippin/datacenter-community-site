import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import type { AppNotification } from "../lib/types";

/** Top-bar notifications indicator (§5.1) + in-app notification feed (§10). */
export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as AppNotification[]) ?? []);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    // Realtime when available; polling as the safety net.
    const channel = supabase
      .channel("notifications-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    const poll = setInterval(() => void load(), 60_000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
    };
  }, [user, load]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markAllRead() {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    await load();
  }

  async function openItem(n: AppNotification) {
    if (!n.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", n.id);
    }
    setOpen(false);
    if (n.event_id) {
      const date = n.occurrence_start ? n.occurrence_start.slice(0, 10) : "";
      navigate(`/?event=${n.event_id}${date ? `&date=${date}` : ""}`);
    }
    await load();
  }

  return (
    <div className="bell-wrap">
      <button
        className="btn btn-ghost bell-btn"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        🔔{unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="menu-pop bell-pop">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="btn btn-ghost small" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 && <p className="muted small bell-empty">Nothing yet.</p>}
          <ul className="plain-list bell-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className={`bell-item ${n.read_at ? "" : "unread"}`}
                  onClick={() => void openItem(n)}
                >
                  <span className="bell-title">{n.title}</span>
                  {n.body && <span className="muted small">{n.body}</span>}
                  <span className="muted small">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
