import { useState, type FormEvent } from "react";
import { ApiError, googleSignIn, useAuth } from "../auth";

type Mode = "login" | "signup";

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await signup(email, password, name || undefined);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <section className="claim-wrap">
      <div className="card claim-card auth-card">
        <h1>🫣 Your photo library</h1>
        <p className="lead">
          Sign in to upload photos, mint claim links, and see who claimed them. Each
          account has its own private library.
        </p>

        <div className="auth-tabs">
          <button
            className={`btn btn-ghost ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            className={`btn btn-ghost ${mode === "signup" ? "active" : ""}`}
            onClick={() => switchMode("signup")}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button className="btn btn-ghost btn-lg google-btn" onClick={googleSignIn} type="button">
          <span className="google-g">G</span> Continue with Google
        </button>

        {error && <div className="status error">{error}</div>}
      </div>
    </section>
  );
}
