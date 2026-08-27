import type { Proxy } from '../types/proxy';

export type EntityJump =
  | { kind: 'policy'; id: string; label: string }
  | { kind: 'target'; id: string; label: string }
  | { kind: 'resource'; id: string; label: string };

// Scans free-form text (a lint message, a prerequisite's "source" field) for
// a reference to something this proxy actually has, so the UI can offer a
// "View" jump instead of making you go find it by hand. Best-effort and
// order-sensitive: the first recognizable, resolvable match wins, and a name
// that doesn't resolve to anything real (e.g. DEPLOY006's dangling Step,
// which names a policy that by definition doesn't exist) correctly yields no
// jump — there's nothing to view.
export function findEntityJump(text: string, proxy: Proxy): EntityJump | null {
  const policyMatch = text.match(/[Pp]olicy\s+"([^"]+)"/);
  if (policyMatch) {
    const policy = proxy.policies.find((p) => p.name === policyMatch[1]);
    if (policy) return { kind: 'policy', id: policy.id, label: policy.name };
  }

  const targetMatch = text.match(/[Tt]arget\s+"([^"]+)"/);
  if (targetMatch) {
    const target = proxy.targets.find((t) => t.name === targetMatch[1]);
    if (target) return { kind: 'target', id: target.id, label: target.name };
  }

  const resourcePathMatch = text.match(/resources\/[^\s"]+/);
  if (resourcePathMatch) {
    const resource = proxy.resources.find((r) => r.path === resourcePathMatch[0]);
    if (resource) return { kind: 'resource', id: resource.id, label: resource.path };
  }

  return null;
}
