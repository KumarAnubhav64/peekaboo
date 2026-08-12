import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Gate from "./pages/Gate";
import RequireAuth from "./RequireAuth";
import LibraryPage from "./pages/LibraryPage";
import PeoplePage from "./pages/PeoplePage";
import PlacesPage from "./pages/PlacesPage";
import ThingsPage from "./pages/ThingsPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import ClaimPage from "./pages/ClaimPage";
import { AuthProvider } from "./auth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* signed-out landing: fullscreen auth page */}
          <Route path="/" element={<Gate />} />

          {/* public claim page — no shell */}
          <Route path="/claim/:token" element={<ClaimPage />} />

          {/* signed-in library shell */}
          <Route element={<RequireAuth />}>
            <Route path="/photos" element={<LibraryPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/places" element={<PlacesPage />} />
            <Route path="/things" element={<ThingsPage />} />
            <Route path="/albums" element={<ComingSoonPage slug="albums" />} />
            <Route path="/trash" element={<ComingSoonPage slug="trash" />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
