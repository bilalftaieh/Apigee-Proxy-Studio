import AdmZip from 'adm-zip';
import { nanoid } from 'nanoid';
import { XMLParser } from 'fast-xml-parser';

// Shared by every "Apigee bundle zip -> app model" importer (proxy bundles,
// shared flow bundles). NOTE: ProxyEndpoint/TargetEndpoint/SharedFlow are
// deliberately excluded — each file's root element uses that same tag name,
// and isArray has no concept of "root vs nested", so including them would
// wrap the whole parsed document in an array. Their only *nested*
// occurrence (name lists inside <ProxyEndpoints>/<TargetEndpoints>/
// <SharedFlows> in a root descriptor file) is handled by asArray() at the
// call site instead, since a single occurrence there parses as a plain
// string either way.
export const REPEATABLE_TAGS = new Set(['Policy', 'Step', 'Flow', 'RouteRule', 'FaultRule', 'Server']);

export const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => REPEATABLE_TAGS.has(name),
});

export function text(value) {
  if (value == null) return '';
  return typeof value === 'object' ? String(value['#text'] ?? '') : String(value);
}

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseSteps(stepNode) {
  return asArray(stepNode)
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      policyName: text(s.Name),
      ...(s.Condition ? { condition: text(s.Condition) } : {}),
    }))
    .filter((s) => s.policyName);
}

export function extractRootTagName(xml) {
  const stripped = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const m = stripped.match(/^<([A-Za-z0-9_]+)/);
  return m ? m[1] : 'Unknown';
}

// Resource references look like "jsc://Foo.js", "py://foo.py",
// "xsl://foo.xsl", etc. — the scheme always matches the bundle's
// resources/<scheme>/ folder name, but the enclosing tag name varies by
// policy type (<ResourceURL> for Javascript/PythonScript/JavaCallout/
// XSLTransform/MessageValidation, <OASResource> for OASValidation,
// <SchemaFile> for GraphQL, ...), so match on the scheme itself rather than
// a specific wrapper tag.
export const RESOURCE_SCHEMES = ['jsc', 'py', 'java', 'xsl', 'wsdl', 'xsd', 'graphql', 'oas'];

// Every resource file in the bundle, keyed by bundle-relative path. Policies
// reference these from their own XML; nothing here belongs to a policy (see
// foldPolicyResources in model.js), so import is a straight sweep of the
// resources/ folder with no ownership to work out.
export function collectBundleResources(entries, entriesByPath, prefix) {
  const resourcesPrefix = `${prefix}resources/`;
  return entries
    .filter((e) => {
      const p = e.entryName.replace(/\\/g, '/');
      return p.startsWith(resourcesPrefix) && p.length > resourcesPrefix.length;
    })
    .map((e) => e.entryName.replace(/\\/g, '/').slice(prefix.length))
    .map((relPath) => ({ id: nanoid(10), path: relPath, content: entriesByPath.get(`${prefix}${relPath}`).getData().toString('utf-8') }));
}

const RESOURCE_SCHEME_RE_G = new RegExp(`(${RESOURCE_SCHEMES.join('|')})://([^\\s<"]+)`, 'g');

// ReadPropertySet is the odd one out: it names its file by basename *without*
// the extension, inside <Read><Name>, with no scheme prefix. The legacy
// <PropertySet name="config.properties"/> form is also matched — Apigee's docs
// have carried both — but only the <Read><Name> shape is what this app's own
// ReadPropertySet template emits, so it's the one that actually has to work.
const READ_NAME_RE = /<Read>[\s\S]*?<Name>\s*([^<\s][^<]*?)\s*<\/Name>/g;
const PROPERTY_SET_RE_G = /<PropertySet\s+name="([^"]+)"\s*\/>/g;

// Every resource this policy's XML references, as bundle-relative paths — used
// by deployChecks.js's DEPLOY009 to catch a <ResourceURL>/<IncludeURL> pointed
// at a file that isn't actually in the bundle. Returns every match, not just
// one: a Javascript policy commonly carries both a <ResourceURL> for its own
// script and an <IncludeURL> for a shared library.
export function extractResourcePaths(xml) {
  const source = String(xml || '');
  const paths = [...source.matchAll(RESOURCE_SCHEME_RE_G)].map((m) => `resources/${m[1]}/${m[2]}`);
  const propPaths = [...source.matchAll(PROPERTY_SET_RE_G)].map((m) => `resources/properties/${m[1]}`);
  // Only ReadPropertySet has a <Read> element, so this can't collide with
  // another policy type's <Name>. The stored file always carries the extension.
  const readPaths = [...source.matchAll(READ_NAME_RE)].map((m) => `resources/properties/${m[1]}.properties`);
  return [...paths, ...propPaths, ...readPaths];
}

// A proxy bundle is XML and small script/schema files; the largest real ones are
// a few MB. These caps exist because the route accepts 20 MB of *compressed*
// bytes and every entry is then decompressed into memory and persisted into the
// stored proxy JSON — a highly-compressible zip would otherwise expand far past
// what the process can hold.
const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 5000;

export function readZip(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    // adm-zip's own message ("ADM-ZIP: Invalid or unsupported zip format. No END
    // header found") reaches the UI verbatim, so it's replaced here.
    throw new Error("That file isn't a readable .zip archive.");
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`This archive has ${entries.length} files, more than the ${MAX_ENTRIES}-file limit for an import.`);
  }

  // header.size is the declared uncompressed size, read from the zip's central
  // directory — so this is checked before any entry is actually decompressed.
  const totalBytes = entries.reduce((sum, e) => sum + (e.header?.size || 0), 0);
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) {
    const mb = Math.round(totalBytes / (1024 * 1024));
    throw new Error(`This archive expands to about ${mb} MB, more than the ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB limit for an import.`);
  }

  const entriesByPath = new Map(entries.map((e) => [e.entryName.replace(/\\/g, '/'), e]));
  return { entries, entriesByPath };
}
