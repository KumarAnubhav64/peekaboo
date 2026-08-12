import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { LibraryProvider } from "@/lib/library-context";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function App() {
  const location = useLocation();
  const isClaim = location.pathname.startsWith("/claim");

  if (isClaim) {
    return (
      <TooltipProvider>
        <Outlet />
      </TooltipProvider>
    );
  }

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
