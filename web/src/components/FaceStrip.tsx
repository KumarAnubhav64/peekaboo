import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users } from "@phosphor-icons/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLibrary } from "@/lib/library-context";
import { personLabel, sortedPeople } from "@/lib/filter";
import { cn } from "@/lib/utils";

const MAX_STRIP = 12;

export function FaceStrip() {
  const { data, filters, setPerson } = useLibrary();
  const navigate = useNavigate();
  const people = useMemo(() => sortedPeople(data), [data]);
  const visible = people.slice(0, MAX_STRIP);
  const overflow = people.length - visible.length;

  if (people.length === 0) return null;

  return (
    <div className="flex items-center gap-3 overflow-x-auto px-4 py-3">
      {visible.map((p, i) => {
        const active = filters.personId === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setPerson(active ? null : p.id)}
            className="group flex shrink-0 flex-col items-center gap-1.5"
            aria-pressed={active}
          >
            <Avatar
              className={cn(
                "h-11 w-11 transition-shadow group-hover:ring-2 group-hover:ring-ring",
                active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              {p.avatar ? <AvatarImage src={p.avatar} alt="" /> : null}
              <AvatarFallback>
                <Users className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "max-w-14 truncate text-[10px] font-medium text-muted-foreground",
                active && "text-primary",
              )}
            >
              {personLabel(i)}
            </span>
          </button>
        );
      })}
      {overflow > 0 && (
        <button
          onClick={() => navigate("/people")}
          className="flex shrink-0 flex-col items-center gap-1.5"
        >
          <Avatar className="h-11 w-11 border-2 border-dashed border-muted-foreground/40 bg-transparent hover:border-muted-foreground/70">
            <AvatarFallback className="bg-transparent text-xs font-semibold text-muted-foreground">
              +{overflow}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-14 truncate text-[10px] font-medium text-muted-foreground">More</span>
        </button>
      )}
    </div>
  );
}
