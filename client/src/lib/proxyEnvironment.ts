import type { ProxyEnvironment, Target } from '../types/proxy';

/**
 * Mirrors server/src/lib/model.js's applyEnvironmentOverrides, scoped to a
 * single target — used anywhere the UI needs to show the *effective* target
 * config for whichever environment is currently selected, not just the base
 * values stored on the Target itself.
 */
export function effectiveTarget(target: Target, env: ProxyEnvironment | undefined): Target {
  const override = env?.targetOverrides?.[target.id];
  if (!override) return target;
  return {
    ...target,
    mode: override.mode ?? target.mode,
    url: override.url ?? target.url,
    targetServers: override.targetServers ?? target.targetServers,
    path: override.path !== undefined ? override.path : target.path,
  };
}
