import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./auth";

export default function App() {
  const location = useLocation();
  const { user, loading, logout } = useAuth();
  const isClaim = location.pathname.startsWith("/claim");

  return (
    <div className="app">
      <nav className="nav">
        <Link className="brand" to="/">
          🫣 Peekaboo
        </Link>
        {!isClaim && <span className="tagline">Find every photo that has you in it</span>}
        <div className="nav-right">
          {user ? (
            <div className="user-chip">
              {user.avatar_url ? (
                <img className="avatar" src={user.avatar_url} alt="" />
              ) : (
                <span className="avatar avatar-fallback">{(user.name || user.email)[0].toUpperCase()}</span>
              )}
              <span className="user-email">{user.name || user.email}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
                Sign out
              </button>
            </div>
          ) : (
            !loading && !isClaim && <span className="tagline">…</span>
          )}
        </div>
      </nav>

      <main className="container">
        <Outlet />
      </main>

      <footer className="footer">
        <p>
          Photos are private — only a person whose face is in a photo can access it, after
          verifying with a selfie.
        </p>
      </footer>
    </div>
  );
}
