import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import App from "./App";
import Gate from "./pages/Gate";
import LibraryPage from "./pages/LibraryPage";
import PeoplePage from "./pages/PeoplePage";
import ComingSoonPage from "./pages/ComingSoonPage";
import ClaimPage from "./pages/ClaimPage";
import { AuthProvider } from "./auth";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<App />}>
            <Route path="/" element={<Gate />} />
            <Route path="/photos" element={<LibraryPage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/places" element={<ComingSoonPage slug="places" />} />
            <Route path="/things" element={<ComingSoonPage slug="things" />} />
            <Route path="/albums" element={<ComingSoonPage slug="albums" />} />
            <Route path="/trash" element={<ComingSoonPage slug="trash" />} />
            <Route path="/claim/:token" element={<ClaimPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
