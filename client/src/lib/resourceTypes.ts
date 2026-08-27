// The resources/<scheme>/ folder set, and how a policy of each type actually
// references a file in it. Mirrors the server's RESOURCE_SCHEMES
// (xmlImportUtils.js) and the reference elements baked into each policy type's
// defaultXml (policyTemplates.js) — those are the source of truth; this table
// exists so the UI can create a correctly-named file and wire it into a policy
// without the user hand-editing XML.

export interface ResourceTypeMeta {
  /** The resources/<scheme>/ folder name, which doubles as the URI scheme. */
  scheme: string;
  label: string;
  /** Default extension, applied when the typed filename has none. */
  ext: string;
  /** Policy types that can reference this kind of file. */
  policyTypes: string[];
  /**
   * The element naming the file the policy *runs* — its script, schema or spec.
   * Single-valued, so setting it replaces whatever was there.
   */
  primaryElement: 'ResourceURL' | 'SchemaFile' | 'OASResource' | 'PropertySetName';
  /**
   * The element used to attach an *additional* shared file to a policy that
   * already has its own. For jsc/py that's the repeatable <IncludeURL> (a
   * Javascript policy has one <ResourceURL> plus one <IncludeURL> per shared
   * library); for every other type there is only the primary element, so
   * linking replaces it.
   */
  linkElement: 'ResourceURL' | 'IncludeURL' | 'SchemaFile' | 'OASResource' | 'PropertySetName';
  hint: string;
  starter: (basename: string) => string;
}

export const RESOURCE_TYPES: ResourceTypeMeta[] = [
  {
    scheme: 'jsc',
    label: 'JavaScript (jsc)',
    ext: '.js',
    policyTypes: ['Javascript'],
    primaryElement: 'ResourceURL',
    linkElement: 'IncludeURL',
    hint: 'Shared helper pulled into Javascript policies via <IncludeURL>. Runs in the policy\u2019s scope, so top-level functions and vars are visible to it.',
    starter: (b) => `// ${b} — shared helper, included by one or more Javascript policies.\n// Loaded before the including policy's own script runs.\n\nfunction example(value) {\n    return value;\n}\n`,
  },
  {
    scheme: 'py',
    label: 'Python (py)',
    ext: '.py',
    policyTypes: ['PythonScript'],
    primaryElement: 'ResourceURL',
    linkElement: 'IncludeURL',
    hint: 'Shared module for PythonScript policies, included via <IncludeURL>.',
    starter: (b) => `# ${b} — shared module, included by one or more PythonScript policies.\n\ndef example(value):\n    return value\n`,
  },
  {
    scheme: 'java',
    label: 'Java JAR (java)',
    ext: '.jar',
    policyTypes: ['JavaCallout'],
    primaryElement: 'ResourceURL',
    linkElement: 'ResourceURL',
    hint: 'A compiled JAR for a JavaCallout. Paste-editing a .jar here is not useful — create the entry, then replace the file in the exported bundle, or keep the JAR out of Studio entirely.',
    starter: () => '',
  },
  {
    scheme: 'xsl',
    label: 'XSLT stylesheet (xsl)',
    ext: '.xsl',
    policyTypes: ['XSL'],
    primaryElement: 'ResourceURL',
    linkElement: 'ResourceURL',
    hint: 'Stylesheet applied by an XSL policy.',
    starter: (b) => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${b} -->\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n    <xsl:template match="@*|node()">\n        <xsl:copy>\n            <xsl:apply-templates select="@*|node()"/>\n        </xsl:copy>\n    </xsl:template>\n</xsl:stylesheet>\n`,
  },
  {
    scheme: 'wsdl',
    label: 'WSDL (wsdl)',
    ext: '.wsdl',
    policyTypes: ['MessageValidation'],
    primaryElement: 'ResourceURL',
    linkElement: 'ResourceURL',
    hint: 'SOAP contract a MessageValidation policy validates against.',
    starter: (b) => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${b} -->\n<definitions xmlns="http://schemas.xmlsoap.org/wsdl/"/>\n`,
  },
  {
    scheme: 'xsd',
    label: 'XML Schema (xsd)',
    ext: '.xsd',
    policyTypes: ['MessageValidation'],
    primaryElement: 'ResourceURL',
    linkElement: 'ResourceURL',
    hint: 'XML schema a MessageValidation policy validates against.',
    starter: (b) => `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${b} -->\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>\n`,
  },
  {
    scheme: 'graphql',
    label: 'GraphQL schema (graphql)',
    ext: '.graphql',
    policyTypes: ['GraphQL'],
    primaryElement: 'SchemaFile',
    linkElement: 'SchemaFile',
    hint: 'Schema a GraphQL policy validates incoming queries against.',
    starter: (b) => `# ${b}\ntype Query {\n    example: String\n}\n`,
  },
  {
    scheme: 'oas',
    label: 'OpenAPI spec (oas)',
    ext: '.yaml',
    policyTypes: ['OASValidation'],
    primaryElement: 'OASResource',
    linkElement: 'OASResource',
    hint: 'Spec an OASValidation policy validates requests/responses against.',
    starter: (b) => `openapi: 3.0.3\ninfo:\n  title: ${b}\n  version: 1.0.0\npaths: {}\n`,
  },
  {
    scheme: 'properties',
    label: 'Property set (properties)',
    ext: '.properties',
    policyTypes: ['ReadPropertySet'],
    primaryElement: 'PropertySetName',
    linkElement: 'PropertySetName',
    hint: 'Key/value file read by a ReadPropertySet policy. Referenced by basename without the extension, so "config.properties" is <Name>config</Name>.',
    starter: (b) => `# ${b}\nexample.key=example-value\n`,
  },
];

export function resourceTypeOf(scheme: string): ResourceTypeMeta | undefined {
  return RESOURCE_TYPES.find((t) => t.scheme === scheme);
}

export function schemeOfPath(path: string): string {
  return path.split('/')[1] || '';
}

export function basenameOfPath(path: string): string {
  return path.split('/').pop() || '';
}

/** "resources/jsc/utils.js" -> "jsc://utils.js" (the form policies reference). */
export function resourceUri(path: string): string {
  return `${schemeOfPath(path)}://${basenameOfPath(path)}`;
}

/** Appends the type's default extension when the user didn't type one. */
export function applyExtension(filename: string, type: ResourceTypeMeta): string {
  const trimmed = filename.trim();
  if (!trimmed) return '';
  return trimmed.includes('.') ? trimmed : `${trimmed}${type.ext}`;
}

export function buildResourcePath(scheme: string, filename: string): string {
  const type = resourceTypeOf(scheme);
  return `resources/${scheme}/${type ? applyExtension(filename, type) : filename.trim()}`;
}

/** Policy types that can reference a file of this scheme. */
export function policyTypesForScheme(scheme: string): string[] {
  return resourceTypeOf(scheme)?.policyTypes ?? [];
}

/**
 * Does this policy's XML already point at this resource? Mirrors
 * ResourcesTab's referencingPolicies, but scheme-aware rather than
 * substring-guessing.
 */
export function policyReferencesResource(xml: string, resourcePath: string): boolean {
  const scheme = schemeOfPath(resourcePath);
  const basename = basenameOfPath(resourcePath);
  if (scheme === 'properties') {
    const stem = basename.replace(/\.properties$/, '');
    return new RegExp(`<Name>\\s*${escapeRegExp(stem)}\\s*</Name>`).test(xml) || xml.includes(`<PropertySet name="${basename}"`);
  }
  return xml.includes(`${scheme}://${basename}`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Indentation used by every policy template's child elements.
const INDENT = '    ';

/**
 * Inserts (or updates) the reference to `resourcePath` in a policy's XML.
 * Returns the XML unchanged when the reference is already there, or when the
 * policy's root element can't be found — this is a convenience, and silently
 * mangling hand-written XML would be worse than doing nothing.
 */
export function linkResourceIntoPolicyXml(xml: string, resourcePath: string): string {
  const scheme = schemeOfPath(resourcePath);
  const type = resourceTypeOf(scheme);
  if (!type || !xml) return xml;
  const basename = basenameOfPath(resourcePath);
  const uri = `${scheme}://${basename}`;

  if (type.linkElement === 'PropertySetName') {
    // ReadPropertySet names the file by basename-without-extension inside
    // <Read><Name>, so this rewrites that element rather than adding one.
    const stem = basename.replace(/\.properties$/, '');
    return xml.replace(/(<Read>[\s\S]*?<Name>)([^<]*)(<\/Name>)/, `$1${stem}$3`);
  }

  if (type.linkElement === 'IncludeURL') {
    // Repeatable: a Javascript policy has its own <ResourceURL> plus one
    // <IncludeURL> per shared library, so this appends instead of replacing.
    if (xml.includes(`<IncludeURL>${uri}</IncludeURL>`)) return xml;
    const line = `${INDENT}<IncludeURL>${uri}</IncludeURL>`;
    // Apigee requires IncludeURL to come before the policy's own ResourceURL.
    const beforeResourceUrl = xml.match(/^([ \t]*)<ResourceURL>/m);
    if (beforeResourceUrl) return xml.replace(/^([ \t]*)<ResourceURL>/m, `${line}\n$1<ResourceURL>`);
    return insertBeforeClosingRoot(xml, line);
  }

  const tag = type.linkElement;
  const existing = new RegExp(`<${tag}>[^<]*</${tag}>`);
  if (existing.test(xml)) return xml.replace(existing, `<${tag}>${uri}</${tag}>`);
  return insertBeforeClosingRoot(xml, `${INDENT}<${tag}>${uri}</${tag}>`);
}

/** Removes the reference, so a mis-click is undoable from the same control. */
export function unlinkResourceFromPolicyXml(xml: string, resourcePath: string): string {
  const scheme = schemeOfPath(resourcePath);
  const type = resourceTypeOf(scheme);
  if (!type || !xml) return xml;
  const uri = `${scheme}://${basenameOfPath(resourcePath)}`;

  if (type.linkElement === 'PropertySetName') return xml; // nothing to remove — <Name> is required
  if (type.linkElement === 'IncludeURL') {
    return xml.replace(new RegExp(`^[ \\t]*<IncludeURL>${escapeRegExp(uri)}</IncludeURL>\\s*\\n`, 'm'), '');
  }
  const tag = type.linkElement;
  return xml.replace(new RegExp(`^[ \\t]*<${tag}>${escapeRegExp(uri)}</${tag}>\\s*\\n`, 'm'), '');
}

/**
 * Points the policy's *primary* reference element at `resourcePath` — the file
 * it actually runs. Distinct from linkResourceIntoPolicyXml, which attaches an
 * extra shared file (an <IncludeURL> for jsc/py) alongside the primary one.
 * Used when a policy is created against an existing or differently-named file,
 * so the type default's `jsc://PolicyName.js` doesn't dangle.
 */
export function setPrimaryResource(xml: string, resourcePath: string): string {
  const scheme = schemeOfPath(resourcePath);
  const type = resourceTypeOf(scheme);
  if (!type || !xml) return xml;
  const basename = basenameOfPath(resourcePath);

  if (type.primaryElement === 'PropertySetName') {
    const stem = basename.replace(/\.properties$/, '');
    return xml.replace(/(<Read>[\s\S]*?<Name>)([^<]*)(<\/Name>)/, `$1${stem}$3`);
  }
  const tag = type.primaryElement;
  const uri = `${scheme}://${basename}`;
  const existing = new RegExp(`<${tag}>[^<]*</${tag}>`);
  if (existing.test(xml)) return xml.replace(existing, `<${tag}>${uri}</${tag}>`);
  return insertBeforeClosingRoot(xml, `${INDENT}<${tag}>${uri}</${tag}>`);
}

/** Every resource in `paths` this policy's XML references. */
export function referencedResourcePaths(xml: string, paths: string[]): string[] {
  return paths.filter((p) => policyReferencesResource(xml, p));
}

// Policy XML is always a single root element; this puts a new child on its own
// line just before the closing tag.
function insertBeforeClosingRoot(xml: string, line: string): string {
  const rootMatch = xml.replace(/<\?xml[^?]*\?>\s*/, '').match(/^<([A-Za-z0-9_]+)/);
  if (!rootMatch) return xml;
  const closing = `</${rootMatch[1]}>`;
  const idx = xml.lastIndexOf(closing);
  if (idx < 0) return xml;
  return `${xml.slice(0, idx)}${line}\n${xml.slice(idx)}`;
}
