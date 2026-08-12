import { Link, Outlet, useLocation } from "react-router-dom";

export default function App() {
  const location = useLocation();
  const isClaim = location.pathname.startsWith("/claim");
  return (
    <div className="app">
      <nav className="nav">
        <Link className="brand" to="/">
          🫣 Peekaboo
        </Link>
        {!isClaim && <span className="tagline">Find every photo that has you in it</span>}
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
