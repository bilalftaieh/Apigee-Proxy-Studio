// Shared by every "external artifact -> app entity" import route (proxy
// zip/curl/OpenAPI/Postman, shared flow zip): dedupe a freshly-imported
// entity's name against what's already saved.
export function uniqueName(base, existingNames) {
  if (!existingNames.includes(base)) return base;
  let name = `${base}-imported`;
  let suffix = 2;
  while (existingNames.includes(name)) {
    name = `${base}-imported-${suffix++}`;
  }
  return name;
}
