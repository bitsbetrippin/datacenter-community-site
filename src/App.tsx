import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { useHousehold } from "./context/HouseholdContext";
import { Shell } from "./components/Shell";
import { SignInPage, SignUpPage, ResetPasswordPage } from "./pages/AuthPages";
import { OnboardingPage } from "./pages/OnboardingPage";
import { CalendarPage } from "./pages/CalendarPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { AuditPage } from "./pages/AuditPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { WallPage } from "./pages/WallPage";
import { ExportPage } from "./pages/ExportPage";
import { ImportPage } from "./pages/ImportPage";
import { useEffect, type ReactNode } from "react";
import { supabase } from "./lib/supabase";
import { applyTheme } from "./lib/themes";

/**
 * Applies the signed-in user's theme + density on every route — including
 * the wall display and export views, which render outside the Shell.
 * "auto" resolves to the current season's pack (see lib/themes.ts).
 */
function ThemeLoader() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) {
      applyTheme("classic");
      document.body.classList.remove("density-compact");
      return;
    }
    void supabase
      .from("user_preferences")
      .select("theme, density")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const prefs = data as { theme?: string; density?: string } | null;
        applyTheme(prefs?.theme ?? "classic");
        document.body.classList.toggle("density-compact", prefs?.density === "compact");
      });
  }, [user]);
  return null;
}

function Loading() {
  return <div className="page-loading">Loading…</div>;
}

/** Signed in + household exists → render inside the shell (UI-001: calendar is home). */
function Protected({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const hh = useHousehold();
  if (loading || (session && hh.loading)) return <Loading />;
  if (!session) return <Navigate to="/signin" replace />;
  if (hh.needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <Shell>{children}</Shell>;
}

/** Signed in + household, WITHOUT the shell (wall display, UI-004). */
function ProtectedBare({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const hh = useHousehold();
  if (loading || (session && hh.loading)) return <Loading />;
  if (!session) return <Navigate to="/signin" replace />;
  if (hh.needsOnboarding) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Signed in but no household yet. */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const hh = useHousehold();
  if (loading || (session && hh.loading)) return <Loading />;
  if (!session) return <Navigate to="/signin" replace />;
  if (!hh.needsOnboarding) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Signed out only. */
function Anonymous({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (session) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <>
    <ThemeLoader />
    <Routes>
      <Route path="/signin" element={<Anonymous><SignInPage /></Anonymous>} />
      <Route path="/signup" element={<Anonymous><SignUpPage /></Anonymous>} />
      <Route path="/reset" element={<Anonymous><ResetPasswordPage /></Anonymous>} />
      <Route path="/onboarding" element={<OnboardingGate><OnboardingPage /></OnboardingGate>} />
      <Route path="/" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/settings/categories" element={<Protected><CategoriesPage /></Protected>} />
      <Route path="/settings/audit" element={<Protected><AuditPage /></Protected>} />
      <Route path="/settings/integrations" element={<Protected><IntegrationsPage /></Protected>} />
      <Route path="/wall" element={<ProtectedBare><WallPage /></ProtectedBare>} />
      <Route path="/export" element={<Protected><ExportPage /></Protected>} />
      <Route path="/import" element={<Protected><ImportPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
