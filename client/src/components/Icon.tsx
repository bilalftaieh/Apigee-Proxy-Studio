import type { LucideProps } from 'lucide-react';
import { FALLBACK_ICON, ICONS } from './iconRegistry';

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Cmp = ICONS[name] || FALLBACK_ICON;
  return <Cmp {...props} />;
}
