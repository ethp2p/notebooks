import * as icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 24, className, strokeWidth = 2 }: IconProps) {
  const LucideIcon = (icons[name as keyof typeof icons] as LucideIcon) || icons.HelpCircle;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
}
