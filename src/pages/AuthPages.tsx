import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden>📅</span>
          <h1>Family Calendar</h1>
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setBusy(false);
      // AUTH-001: do not reveal whether the account exists.
      setError("Sign in failed. Check your email and password and try again.");
      return;
    }
    // AUTH-003: challenge when the account has MFA enrolled.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setBusy(false);
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      setNeedsMfa(true);
      return;
    }
    navigate("/");
  }

  async function onMfaSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.[0];
    if (!factor) {
      setBusy(false);
      setError("No authenticator found on this account.");
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) {
      setBusy(false);
      setError("Could not start verification. Try again.");
      return;
    }
    const { error: err } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: mfaCode.trim(),
    });
    setBusy(false);
    if (err) {
      setError("That code didn't match. Try again.");
      return;
    }
    navigate("/");
  }

  if (needsMfa) {
    return (
      <AuthShell title="Two-factor code">
        <form onSubmit={onMfaSubmit} className="stack">
          <label>
            Enter the 6-digit code from your authenticator app
            <input
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              autoFocus
              required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Sign in">
      <form onSubmit={onSubmit} className="stack">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/reset">Forgot password?</Link>
        <span> · </span>
        <Link to="/signup">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function SignUpPage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // If email confirmation is enabled in Supabase, there is no session yet.
    if (data.session) navigate("/");
    else setDone(true);
  }

  if (done) {
    return (
      <AuthShell title="Check your email">
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Open it to
          activate your account, then come back and{" "}
          <Link to="/signin">sign in</Link>.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account">
      <form onSubmit={onSubmit} className="stack">
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Carter"
            required
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/signin">Already have an account? Sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/signin`,
    });
    setBusy(false);
    // AUTH-002 + AUTH-001: always confirm, never reveal whether the email exists.
    setSent(true);
  }

  return (
    <AuthShell title="Reset password">
      {sent ? (
        <p>
          If an account exists for <strong>{email}</strong>, a reset link is on
          its way. <Link to="/signin">Back to sign in</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
