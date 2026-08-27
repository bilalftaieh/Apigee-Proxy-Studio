import { nanoid } from 'nanoid';
import { foldPolicyResources, normalizeResources } from './model.js';

export function normalizeSharedFlow(sf) {
  if (!sf) return sf;
  const { policies, resources } = foldPolicyResources(
    Array.isArray(sf.policies) ? sf.policies : [],
    normalizeResources(sf.resources)
  );
  return {
    ...sf,
    policies,
    steps: Array.isArray(sf.steps) ? sf.steps : [],
    resources,
    lintExcludes: Array.isArray(sf.lintExcludes) ? sf.lintExcludes : [],
  };
}

export function createBlankSharedFlow({ name, description } = {}) {
  const id = nanoid(10);
  const safeName = name || 'new-shared-flow';
  return {
    id,
    name: safeName,
    description: description || '',
    policies: [],
    steps: [],
    resources: [],
    lintExcludes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function uniqueCopyName(baseName, takenNames) {
  let name = `${baseName}-copy`;
  let suffix = 2;
  while (takenNames.includes(name)) {
    name = `${baseName}-copy-${suffix++}`;
  }
  return name;
}

export function duplicateSharedFlow(existing, existingNames = []) {
  const cloned = JSON.parse(JSON.stringify(existing));
  const name = uniqueCopyName(existing.name, existingNames);
  return normalizeSharedFlow({
    ...cloned,
    id: nanoid(10),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
