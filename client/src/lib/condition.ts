import type { ConditionVerb, PathOperator } from '../types/proxy';

// A path template segment (`{petId}`) is this app's own internal notation for
// "one variable segment" — it's what the exporters read to rebuild an OpenAPI
// path template or a Postman `:petId` variable, so it's kept verbatim in
// flow.pathValue. Apigee's condition grammar has no such syntax: MatchesPath
// only understands `*` (one segment) and `**` (many), and a literal
// "/pets/{petId}" pattern matches nothing at all — so it's translated here,
// where the condition string is built.
//
// A literal `"` is dropped rather than escaped: the pattern is interpolated into
// a double-quoted condition string, and Apigee's grammar offers no backslash
// escape and no alternate quote character, so there is no spelling of it that
// survives. Emitting it raw produced `MatchesPath "/a"b"`, which Apigee rejects
// at deploy time.
//
// Mirrors the server's toApigeePathPattern (server/src/lib/model.js).
export function toApigeePathPattern(pathValue: string): string {
  return (pathValue || '').trim().replace(/\{[^/{}]*\}/g, '*').replace(/"/g, '');
}

export function computeFlowCondition(pathOperator: PathOperator, pathValue: string, verb: ConditionVerb): string {
  const path = toApigeePathPattern(pathValue);
  const pathPart = path ? `proxy.pathsuffix ${pathOperator} "${path}"` : '';
  const verbPart = verb && verb !== 'ANY' ? `request.verb = "${verb}"` : '';
  if (pathPart && verbPart) return `(${pathPart}) and (${verbPart})`;
  return pathPart || verbPart || '';
}
