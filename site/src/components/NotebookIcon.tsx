import * as icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NotebookIconProps {
  icon?: string;
  size?: number;
  className?: string;
}

export function NotebookIcon({
  icon = "FileText",
  size = 24,
  className,
}: NotebookIconProps) {
  const Icon =
    (icons[icon as keyof typeof icons] as LucideIcon) || icons.FileText;
  return <Icon size={size} className={className} />;
}
