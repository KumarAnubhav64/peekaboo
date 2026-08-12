import { Navigate, Outlet } from "react-router-dom";
import { CircleNotch } from "@phosphor-icons/react";
import { useAuth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LibraryProvider } from "@/lib/library-context";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Guards the library views: signed-out visitors are sent to the auth page
 * (fullscreen, no app shell); signed-in users get the three-zone shell with
 * the LibraryProvider that loads their photos.
 */
export default function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full min-h-screen items-center justify-center">
        <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  return (
    <TooltipProvider>
      <LibraryProvider>
        <div className="flex h-full overflow-hidden">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main className="flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
      </LibraryProvider>
    </TooltipProvider>
  );
}
