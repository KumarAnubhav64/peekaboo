import { useNavigate } from "react-router-dom";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { FolderOpen, Trash } from "@phosphor-icons/react";
import { EmptyState } from "@/components/EmptyState";

export type ComingSoonSlug = "albums" | "trash";

type IconType = ComponentType<IconProps>;

const COPY: Record<ComingSoonSlug, { icon: IconType; title: string; description: string }> = {
  albums: {
    icon: FolderOpen,
    title: "Albums",
    description:
      "Create manual albums or smart albums that auto-fill from a saved filter — coming in the next milestone.",
  },
  trash: {
    icon: Trash,
    title: "Trash",
    description:
      "Deleted photos will live here for 30 days before being removed. Deleting is coming in the next milestone.",
  },
};

export default function ComingSoonPage({ slug }: { slug: ComingSoonSlug }) {
  const navigate = useNavigate();
  const { icon, title, description } = COPY[slug];
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      actionLabel="Back to photos"
      onAction={() => navigate("/photos")}
    />
  );
}
