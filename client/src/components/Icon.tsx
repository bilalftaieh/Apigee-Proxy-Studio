import * as Icons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

function toPascalCase(key: string): string {
  return key
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const componentName = toPascalCase(name) as keyof typeof Icons;
  const Cmp = (Icons[componentName] as React.ComponentType<LucideProps>) || Icons.Puzzle;
  return <Cmp {...props} />;
}
