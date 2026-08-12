import { NavLink } from "react-router-dom";
import {
  FolderKanban,
  Image,
  Loader2,
  LogOut,
  MapPin,
  Plus,
  Shapes,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/auth";
import { useLibrary } from "@/lib/library-context";
import { UploadDialog } from "@/components/UploadDialog";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/photos", label: "All photos", icon: Image },
  { to: "/people", label: "People", icon: Users },
  { to: "/places", label: "Places", icon: MapPin },
  { to: "/things", label: "Things", icon: Shapes },
  { to: "/albums", label: "Albums", icon: FolderKanban },
  { to: "/trash", label: "Trash", icon: Trash2 },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { analyzing, upload } = useLibrary();

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="text-xl">🫣</span>
        <span className="text-[15px] font-semibold tracking-tight">Peekaboo</span>
      </div>

      <div className="px-3 pb-2">
        <UploadDialog onFiles={upload}>
          <Button className="w-full" size="sm">
            {analyzing ? <Loader2 className="animate-spin" /> : <Plus />}
            {analyzing ? "Analyzing…" : "Upload"}
          </Button>
        </UploadDialog>
      </div>

      <Separator className="mx-3" />

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-accent hover:text-accent-foreground",
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Separator className="mx-3" />

      <div className="p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {(user?.name || user?.email || "?")[0].toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight">
              {user?.name || user?.email}
            </p>
            <p className="truncate text-[11px] text-muted-foreground leading-tight">
              {user?.name ? user.email : "Signed in"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-muted-foreground"
          onClick={() => logout()}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
