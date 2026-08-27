/**
 * What elements and attributes each policy type accepts, for completion and
 * hover in the raw-XML editor.
 *
 * Two sources, in this order:
 *
 *   1. **Derived** from `POLICY_SCHEMAS` (policySchema.ts). Those schemas
 *      already describe, for 12 policy types, every field the visual editor can
 *      render — as an element path, with a label, help text, enum options and
 *      whether the value is a variable reference. That is exactly a completion
 *      catalogue wearing a different hat, so it is converted rather than
 *      retyped: adding a field to a visual editor extends XML completion in the
 *      same commit, and the two can't drift.
 *   2. **Authored** below, for types the visual editor doesn't cover. Ordered by
 *      what the proxies in this workspace actually use, not by the docs' order.
 *
 * Coverage is deliberately partial. Apigee X has ~60 policy root tags and
 * guessing at the long tail would put wrong elements in the list, which is
 * worse than an empty one — for an unknown tag the providers fall back to the
 * universal elements plus whatever the open document already contains, and
 * suggest nothing they can't stand behind.
 */

import { POLICY_SCHEMAS, type PolicyField, type PolicySchema } from './policySchema';

export interface XmlAttrDef {
  name: string;
  doc?: string;
  values?: string[];
  default?: string;
}

export interface XmlElementDef {
  name: string;
  doc?: string;
  attrs?: XmlAttrDef[];
  children?: XmlElementDef[];
  /** Allowed text-content values, offered as completions inside the element. */
  values?: string[];
  /** Text content names a flow variable, so variable completion applies inside it. */
  takesVariable?: boolean;
  /** May appear more than once under its parent (`<Header>`, `<MatchRule>`, …). */
  repeatable?: boolean;
}

/**
 * Attributes every Apigee policy root accepts, whatever its type.
 * `continueOnError` is called out because getting it wrong is the difference
 * between a fault rule running and a broken response sailing through.
 */
export const UNIVERSAL_ROOT_ATTRS: XmlAttrDef[] = [
  { name: 'name', doc: 'Policy name. **Must match the policy file name**, or the bundle fails to deploy.' },
  { name: 'enabled', values: ['true', 'false'], default: 'true', doc: 'Set `false` to keep the policy in the bundle but skip it at runtime.' },
  {
    name: 'continueOnError',
    values: ['false', 'true'],
    default: 'false',
    doc: 'When `false` (the default) a failure raises a fault and jumps to fault handling. When `true` the flow carries on — check `is.error` yourself afterwards.',
  },
  { name: 'async', values: ['false', 'true'], default: 'false', doc: 'Deprecated in Apigee X. Leave unset.' },
];

/** Elements valid directly under almost any policy root. */
const DISPLAY_NAME: XmlElementDef = {
  name: 'DisplayName',
  doc: 'Label shown in the Apigee console. Falls back to the policy name when omitted.',
};

/**
 * Generic policy metadata. Not in any visual-editor schema, but present on
 * policies across the bundles in this workspace — it survives a round trip
 * through Apigee, so it belongs in completion.
 */
const PROPERTIES: XmlElementDef = {
  name: 'Properties',
  doc: 'Generic name/value metadata carried with the policy.',
  children: [{ name: 'Property', repeatable: true, doc: 'One property.', attrs: [{ name: 'name' }] }],
};

const IGNORE_UNRESOLVED: XmlElementDef = {
  name: 'IgnoreUnresolvedVariables',
  values: ['true', 'false'],
  doc: 'When `false`, referencing a variable that does not exist raises a fault instead of resolving to empty. Valid only on policies that read variables.',
};

// ---------------------------------------------------------------------------
// Authored catalogue — policy types the visual editor doesn't cover.
// ---------------------------------------------------------------------------

const EXTRACT_VARIABLES_SOURCES = (): XmlElementDef[] => {
  const pattern: XmlElementDef = {
    name: 'Pattern',
    repeatable: true,
    doc: 'Match pattern. `{name}` marks a capture, and each capture becomes a variable (prefixed by `<VariablePrefix>` when set).',
    attrs: [{ name: 'ignoreCase', values: ['true', 'false'], doc: 'Case-insensitive matching.' }],
  };
  const payloadVariable: XmlElementDef = {
    name: 'Variable',
    repeatable: true,
    doc: 'One variable to extract. `name` is the variable it creates; the body is the JSONPath/XPath to read.',
    attrs: [
      { name: 'name', doc: 'Variable this creates, under `<VariablePrefix>` when one is set.' },
      { name: 'type', values: ['string', 'boolean', 'integer', 'long', 'float', 'double', 'nodeset'], doc: 'Coerce the extracted value to this type.' },
    ],
  };
  return [
    { name: 'URIPath', doc: 'Extract from the request path.', children: [pattern] },
    {
      name: 'QueryParam',
      repeatable: true,
      doc: 'Extract from one query parameter.',
      attrs: [{ name: 'name', doc: 'Query parameter to read.' }],
      children: [pattern],
    },
    {
      name: 'Header',
      repeatable: true,
      doc: 'Extract from one header.',
      attrs: [{ name: 'name', doc: 'Header to read.' }],
      children: [pattern],
    },
    {
      name: 'FormParam',
      repeatable: true,
      doc: 'Extract from one form parameter.',
      attrs: [{ name: 'name', doc: 'Form parameter to read.' }],
      children: [pattern],
    },
    {
      name: 'JSONPayload',
      doc: 'Extract from a JSON body using JSONPath.',
      children: [payloadVariable],
    },
    {
      name: 'XMLPayload',
      doc: 'Extract from an XML body using XPath.',
      attrs: [{ name: 'stopPayloadProcessing', values: ['false', 'true'], doc: 'Stop after the first match.' }],
      children: [
        {
          name: 'Namespaces',
          doc: 'Namespace prefixes used by the XPath expressions below.',
          children: [{ name: 'Namespace', repeatable: true, doc: 'One prefix-to-URI binding.', attrs: [{ name: 'prefix' }] }],
        },
        payloadVariable,
      ],
    },
    {
      name: 'Variable',
      repeatable: true,
      doc: 'Extract from another flow variable rather than from the message.',
      attrs: [{ name: 'name', doc: 'Variable to read from.' }],
      children: [pattern],
    },
  ];
};

const CACHE_KEY: XmlElementDef = {
  name: 'CacheKey',
  doc: 'How the cache entry is named. Combine a `<Prefix>` with one or more `<KeyFragment>`s.',
  children: [
    { name: 'Prefix', doc: 'Static namespace for these entries, keeping them clear of other policies\' keys.' },
    {
      name: 'KeyFragment',
      repeatable: true,
      doc: 'One part of the key. Set `ref` to a flow variable, or put a literal in the body.',
      attrs: [
        { name: 'ref', doc: 'Flow variable supplying this fragment.' },
        { name: 'type', values: ['string'], doc: 'Fragment type.' },
      ],
      takesVariable: true,
    },
  ],
};

const CACHE_SCOPE: XmlElementDef = {
  name: 'Scope',
  values: ['Global', 'Application', 'Proxy', 'Target', 'Exclusive'],
  doc: 'How widely the key is shared. `Exclusive` confines entries to this policy; `Global` shares them across the environment.',
};

const AUTHORED: Record<string, XmlElementDef> = {
  // -------------------------------------------------------------- FlowCallout
  FlowCallout: {
    name: 'FlowCallout',
    children: [
      DISPLAY_NAME,
      {
        name: 'SharedFlowBundle',
        doc: 'Name of the shared flow to call. **It must be deployed to the same environment** — a missing shared flow is a deploy failure, not a runtime one.',
      },
      {
        name: 'Parameters',
        doc: 'Values passed to the shared flow, readable there as `flow.<name>`.',
        children: [
          {
            name: 'Parameter',
            repeatable: true,
            doc: 'One parameter. Use `ref` to pass a variable, or put a literal in the body.',
            attrs: [
              { name: 'name', doc: 'Parameter name, read inside the shared flow as `flow.<name>`.' },
              { name: 'ref', doc: 'Flow variable whose value is passed.' },
            ],
          },
        ],
      },
    ],
  },

  // --------------------------------------------------------- ExtractVariables
  ExtractVariables: {
    name: 'ExtractVariables',
    children: [
      DISPLAY_NAME,
      {
        name: 'Source',
        doc: 'Message or variable to read from. Defaults to the message the current flow is handling.',
        takesVariable: true,
      },
      {
        name: 'VariablePrefix',
        doc: 'Prefix for every variable this policy creates, e.g. prefix `auth` plus capture `sub` gives `auth.sub`.',
      },
      ...EXTRACT_VARIABLES_SOURCES(),
      IGNORE_UNRESOLVED,
    ],
  },

  // ------------------------------------------------------ JSON/XML conversion
  JSONToXML: {
    name: 'JSONToXML',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Message holding the JSON to convert.', takesVariable: true },
      { name: 'OutputVariable', doc: 'Where the XML is written. Defaults to the source message.', takesVariable: true },
      {
        name: 'Options',
        doc: 'Naming rules for the generated XML.',
        children: [
          { name: 'OmitXmlDeclaration', values: ['false', 'true'], doc: 'Leave out the `<?xml …?>` prolog.' },
          { name: 'NamespaceBlockName', doc: 'JSON property treated as the namespace block.' },
          { name: 'DefaultNamespaceNodeName', doc: 'JSON property holding the default namespace.' },
          { name: 'NamespaceSeparator', doc: 'Separator between namespace prefix and local name.' },
          { name: 'TextNodeName', doc: 'JSON property mapped to element text content.' },
          { name: 'AttributeBlockName', doc: 'JSON property whose members become attributes.' },
          { name: 'AttributePrefix', doc: 'Prefix marking a JSON property as an attribute.' },
          { name: 'InvalidCharsReplacement', doc: 'Replacement for characters not legal in XML names.' },
          { name: 'ObjectRootElementName', doc: 'Element name wrapping a JSON object at the root.' },
          { name: 'ArrayRootElementName', doc: 'Element name wrapping a JSON array at the root.' },
          { name: 'ArrayItemElementName', doc: 'Element name for each item of a root-level JSON array.' },
        ],
      },
    ],
  },

  XMLToJSON: {
    name: 'XMLToJSON',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Message holding the XML to convert.', takesVariable: true },
      { name: 'OutputVariable', doc: 'Where the JSON is written. Defaults to the source message.', takesVariable: true },
      {
        name: 'Options',
        doc: 'Naming rules for the generated JSON. `<StripLevels>` and `<NamespaceBlockName>` are what usually need setting when unwrapping a SOAP body.',
        children: [
          { name: 'RecognizeNumber', values: ['true', 'false'], doc: 'Emit numeric text as JSON numbers rather than strings.' },
          { name: 'RecognizeBoolean', values: ['true', 'false'], doc: 'Emit `true`/`false` text as JSON booleans.' },
          { name: 'RecognizeNull', values: ['true', 'false'], doc: 'Emit empty elements as `null`.' },
          { name: 'NullValue', doc: 'Token treated as null.' },
          { name: 'NamespaceBlockName', doc: 'JSON property the namespace declarations are collected into.' },
          { name: 'DefaultNamespaceNodeName', doc: 'JSON property holding the default namespace.' },
          { name: 'NamespaceSeparator', doc: 'Separator inserted between prefix and local name.' },
          { name: 'TextNodeName', doc: 'JSON property that element text content becomes.' },
          { name: 'TextAlwaysAsProperty', values: ['false', 'true'], doc: 'Always emit text content under `<TextNodeName>`, even when the element has no attributes or children.' },
          { name: 'InvalidCharsReplacement', doc: 'Replacement for characters not legal in a JSON property name.' },
          { name: 'AttributeBlockName', doc: 'JSON property that attributes are collected into.' },
          { name: 'AttributePrefix', doc: 'Prefix added to attribute-derived properties.' },
          { name: 'OutputPrefix', doc: 'String prepended to the generated JSON.' },
          { name: 'OutputSuffix', doc: 'String appended to the generated JSON.' },
          { name: 'StripLevels', doc: 'Number of outer element levels to discard — how a SOAP envelope and body get unwrapped in one step.' },
          { name: 'TreatAsArray', doc: 'Paths that must always come out as arrays, even with a single child.', children: [{ name: 'Path', repeatable: true, doc: 'One path forced to an array.', attrs: [{ name: 'unwrap', values: ['true', 'false'] }] }] },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------- script
  Javascript: {
    name: 'Javascript',
    attrs: [{ name: 'timeLimit', doc: 'Milliseconds before the script is killed.' }],
    children: [
      DISPLAY_NAME,
      { name: 'ResourceURL', doc: 'The script to run — `jsc://<file>.js`, matching a file on the Resources tab.' },
      { name: 'IncludeURL', repeatable: true, doc: 'A library loaded before the main script, e.g. `jsc://lib.js`. Repeat in load order.' },
      {
        name: 'Properties',
        doc: 'Values readable in the script via `properties.<name>`.',
        children: [{ name: 'Property', repeatable: true, doc: 'One property.', attrs: [{ name: 'name' }] }],
      },
      { name: 'Source', doc: 'Inline script body, as an alternative to `<ResourceURL>`. A real file is easier to lint and diff.' },
    ],
  },

  PythonScript: {
    name: 'PythonScript',
    children: [
      DISPLAY_NAME,
      { name: 'ResourceURL', doc: 'The script to run — `py://<file>.py`.' },
      { name: 'IncludeURL', repeatable: true, doc: 'A library loaded before the main script, e.g. `py://lib.py`.' },
    ],
  },

  XSL: {
    name: 'XSL',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Message holding the XML to transform.', takesVariable: true },
      { name: 'ResourceURL', doc: 'The stylesheet to apply — `xsl://<file>.xsl`.' },
      { name: 'OutputVariable', doc: 'Where the result is written. Defaults to the source message.', takesVariable: true },
      {
        name: 'Parameters',
        doc: 'Parameters passed into the stylesheet.',
        attrs: [{ name: 'ignoreUnresolvedVariables', values: ['true', 'false'] }],
        children: [
          {
            name: 'Parameter',
            repeatable: true,
            doc: 'One stylesheet parameter. Use `ref` for a variable, `value` for a literal.',
            attrs: [{ name: 'name' }, { name: 'ref' }, { name: 'value' }],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------- cache
  PopulateCache: {
    name: 'PopulateCache',
    children: [
      DISPLAY_NAME,
      { name: 'CacheResource', doc: 'Named cache to write to. Must exist in the environment — it appears on the Prerequisites panel.' },
      CACHE_KEY,
      CACHE_SCOPE,
      { name: 'ExpirySettings', doc: 'How long the entry lives.', children: [
        { name: 'TimeoutInSeconds', doc: 'Seconds from write until the entry expires.', takesVariable: true },
        { name: 'TimeOfDay', doc: 'Daily expiry wall-clock time, `HH:mm:ss`.' },
        { name: 'ExpiryDate', doc: 'Absolute expiry date, `mm-dd-yyyy`.' },
      ] },
      { name: 'Source', doc: 'Variable whose value is cached.', takesVariable: true },
    ],
  },

  LookupCache: {
    name: 'LookupCache',
    children: [
      DISPLAY_NAME,
      { name: 'CacheResource', doc: 'Named cache to read from.' },
      CACHE_KEY,
      CACHE_SCOPE,
      {
        name: 'AssignTo',
        doc: 'Variable the cache hit is written to. **Nothing is set on a miss**, so test the variable before relying on it.',
        takesVariable: true,
      },
    ],
  },

  InvalidateCache: {
    name: 'InvalidateCache',
    children: [
      DISPLAY_NAME,
      { name: 'CacheResource', doc: 'Named cache to evict from.' },
      CACHE_KEY,
      CACHE_SCOPE,
      { name: 'PurgeChildEntries', values: ['false', 'true'], doc: 'Also evict entries sharing this key prefix.' },
    ],
  },

  ResponseCache: {
    name: 'ResponseCache',
    children: [
      DISPLAY_NAME,
      { name: 'CacheResource', doc: 'Named cache to use.' },
      CACHE_KEY,
      CACHE_SCOPE,
      { name: 'ExpirySettings', doc: 'How long a cached response lives.', children: [
        { name: 'TimeoutInSeconds', doc: 'Seconds until the cached response expires.', takesVariable: true },
        { name: 'TimeOfDay', doc: 'Daily expiry wall-clock time, `HH:mm:ss`.' },
      ] },
      { name: 'SkipCacheLookup', doc: 'Condition that, when true, bypasses the cached copy — typically a `Cache-Control: no-cache` check.' },
      { name: 'SkipCachePopulation', doc: 'Condition that, when true, keeps the response out of the cache — typically a non-200 status.' },
      { name: 'ExcludeErrorResponse', values: ['true', 'false'], doc: 'When `true`, only 2xx responses are cached. Usually what you want.' },
      { name: 'UseAcceptHeader', values: ['false', 'true'], doc: 'Add `Accept*` headers to the cache key.' },
      { name: 'UseResponseCacheHeaders', values: ['false', 'true'], doc: 'Honour the backend\'s own `Cache-Control` when computing expiry.' },
    ],
  },

  // ------------------------------------------------------------------ JWT/JWS
  GenerateJWT: {
    name: 'GenerateJWT',
    children: [
      DISPLAY_NAME,
      { name: 'Algorithm', values: ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256', 'PS384', 'PS512'], doc: 'Signing algorithm.' },
      { name: 'SecretKey', doc: 'Symmetric key, for the `HS*` algorithms.', children: [{ name: 'Value', doc: 'The key. Reference a KVM entry rather than inlining it.', attrs: [{ name: 'ref' }] }] },
      { name: 'PrivateKey', doc: 'Private key, for the asymmetric algorithms.', children: [{ name: 'Value', attrs: [{ name: 'ref' }] }, { name: 'Password', attrs: [{ name: 'ref' }] }, { name: 'Id', attrs: [{ name: 'ref' }] }] },
      { name: 'Subject', doc: '`sub` claim.' },
      { name: 'Issuer', doc: '`iss` claim.' },
      { name: 'Audience', doc: '`aud` claim.', attrs: [{ name: 'ref' }] },
      { name: 'Id', doc: '`jti` claim. Omit the body to have one generated.' },
      { name: 'ExpiresIn', doc: 'Lifetime, e.g. `1h`, `30m`, `3600s`.', attrs: [{ name: 'ref' }] },
      { name: 'NotBefore', doc: '`nbf` claim.' },
      {
        name: 'AdditionalClaims',
        doc: 'Custom claims beyond the registered ones.',
        children: [{ name: 'Claim', repeatable: true, doc: 'One claim.', attrs: [{ name: 'name' }, { name: 'ref' }, { name: 'type', values: ['string', 'number', 'boolean', 'map'] }, { name: 'array', values: ['true', 'false'] }] }],
      },
      { name: 'AdditionalHeaders', doc: 'Custom JOSE header parameters.', children: [{ name: 'Claim', repeatable: true, attrs: [{ name: 'name' }, { name: 'ref' }] }] },
      { name: 'OutputVariable', doc: 'Where the signed JWT is written. Defaults to `jwt.<policy>.generated_jwt`.', takesVariable: true },
    ],
  },

  DecodeJWT: {
    name: 'DecodeJWT',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Variable holding the JWT. **Decode does not verify the signature** — pair it with VerifyJWT before trusting any claim.', takesVariable: true },
    ],
  },

  // -------------------------------------------------------------- protections
  JSONThreatProtection: {
    name: 'JSONThreatProtection',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Message to inspect.', takesVariable: true },
      { name: 'ArrayElementCount', doc: 'Maximum entries in any one array.' },
      { name: 'ObjectEntryCount', doc: 'Maximum members in any one object.' },
      { name: 'ObjectEntryNameLength', doc: 'Maximum length of a property name.' },
      { name: 'StringValueLength', doc: 'Maximum length of a string value.' },
      { name: 'ContainerDepth', doc: 'Maximum nesting depth of objects/arrays.' },
    ],
  },

  RegularExpressionProtection: {
    name: 'RegularExpressionProtection',
    children: [
      DISPLAY_NAME,
      { name: 'Source', doc: 'Message to inspect.', takesVariable: true },
      { name: 'IgnoreUnresolvedVariables', values: ['true', 'false'] },
      { name: 'URIPath', doc: 'Patterns applied to the request path.', children: [{ name: 'Pattern', repeatable: true }] },
      { name: 'QueryParam', repeatable: true, doc: 'Patterns applied to one query parameter.', attrs: [{ name: 'name' }], children: [{ name: 'Pattern', repeatable: true }] },
      { name: 'Header', repeatable: true, doc: 'Patterns applied to one header.', attrs: [{ name: 'name' }], children: [{ name: 'Pattern', repeatable: true }] },
      { name: 'FormParam', repeatable: true, doc: 'Patterns applied to one form parameter.', attrs: [{ name: 'name' }], children: [{ name: 'Pattern', repeatable: true }] },
      { name: 'JSONPayload', doc: 'Patterns applied to JSON body values.', children: [{ name: 'JSONPath', repeatable: true, children: [{ name: 'Expression' }, { name: 'Pattern', repeatable: true }] }] },
      { name: 'XMLPayload', doc: 'Patterns applied to XML body values.', children: [{ name: 'Namespaces', children: [{ name: 'Namespace', repeatable: true, attrs: [{ name: 'prefix' }] }] }, { name: 'XPath', repeatable: true, children: [{ name: 'Expression' }, { name: 'Pattern', repeatable: true }] }] },
    ],
  },
};

/**
 * Extra children folded into a *derived* tree.
 *
 * `POLICY_SCHEMAS` describes what the visual editor renders, which is not quite
 * the same set as what the XML accepts — `<AssignVariable>` is the clearest
 * case: it is how an AssignMessage policy sets a flow variable, it appears in
 * most of the AssignMessage policies in this workspace, and the visual editor
 * has no field for it. Augmenting keeps the derived tree as the source for
 * everything it does cover instead of forcing a full hand-authored duplicate.
 */
const AUGMENTS: Record<string, XmlElementDef[]> = {
  AssignMessage: [
    {
      name: 'AssignVariable',
      repeatable: true,
      doc: 'Creates or overwrites a flow variable. `<Name>` is the variable; give it a `<Value>` (literal), `<Ref>` (copy another variable) or `<Template>` (interpolate `{…}` references).',
      children: [
        { name: 'Name', doc: 'Variable to assign to.' },
        { name: 'Value', doc: 'Literal value. Also the fallback when `<Ref>` does not resolve.' },
        { name: 'Ref', doc: 'Variable to copy the value from.', takesVariable: true },
        { name: 'Template', doc: 'String with `{variable}` references interpolated. The usual way to build a composite value.', attrs: [{ name: 'ref' }] },
        { name: 'PropertySetRef', doc: 'Property-set entry to read the value from.' },
      ],
    },
  ],
};

/**
 * Apigee reference page per policy tag. Hand-maintained: a slug that goes stale
 * shows up as a 404 the moment someone clicks it, which is a cheap failure —
 * whereas deriving slugs from tag names silently produces plausible-looking
 * wrong links for the irregular ones, and there are a lot of those. The JWT/JWS
 * pages hyphenate (`verify-jwt-policy`) while `OAuthV2` does not
 * (`oauthv2-policy`); `RegularExpressionProtection` has no `-policy` suffix at
 * all; `MessageValidation` is filed under `message-validation-policy`.
 *
 * Every slug below was checked with a request against
 * cloud.google.com — re-run that check rather than trusting the pattern if you
 * add one.
 */
const DOC_SLUGS: Record<string, string> = {
  AccessControl: 'access-control-policy',
  AccessEntity: 'access-entity-policy',
  AssignMessage: 'assign-message-policy',
  BasicAuthentication: 'basic-authentication-policy',
  CORS: 'cors-policy',
  DecodeJWS: 'decode-jws-policy',
  DecodeJWT: 'decode-jwt-policy',
  ExtractVariables: 'extract-variables-policy',
  FlowCallout: 'flow-callout-policy',
  GenerateJWS: 'generate-jws-policy',
  GenerateJWT: 'generate-jwt-policy',
  GraphQL: 'graphql-policy',
  HMAC: 'hmac-policy',
  InvalidateCache: 'invalidate-cache-policy',
  Javascript: 'javascript-policy',
  JavaCallout: 'java-callout-policy',
  JSONThreatProtection: 'json-threat-protection-policy',
  JSONToXML: 'json-xml-policy',
  KeyValueMapOperations: 'key-value-map-operations-policy',
  LookupCache: 'lookup-cache-policy',
  MessageLogging: 'message-logging-policy',
  MessageValidation: 'message-validation-policy',
  OASValidation: 'oas-validation-policy',
  OAuthV2: 'oauthv2-policy',
  PopulateCache: 'populate-cache-policy',
  PythonScript: 'python-script-policy',
  Quota: 'quota-policy',
  RaiseFault: 'raise-fault-policy',
  RegularExpressionProtection: 'regular-expression-protection',
  ResetQuota: 'reset-quota-policy',
  ResponseCache: 'response-cache-policy',
  ServiceCallout: 'service-callout-policy',
  SpikeArrest: 'spike-arrest-policy',
  VerifyAPIKey: 'verify-api-key-policy',
  VerifyJWS: 'verify-jws-policy',
  VerifyJWT: 'verify-jwt-policy',
  XMLThreatProtection: 'xml-threat-protection-policy',
  XMLToJSON: 'xml-json-policy',
  XSL: 'xsl-transform-policy',
};

export function policyDocUrl(rootTag: string): string | undefined {
  const slug = DOC_SLUGS[rootTag];
  return slug ? `https://cloud.google.com/apigee/docs/api-platform/reference/policies/${slug}` : undefined;
}

// ---------------------------------------------------------------------------
// Derivation from POLICY_SCHEMAS
// ---------------------------------------------------------------------------

/** Finds or creates the child named `name` under `parent`. */
function childNode(parent: XmlElementDef, name: string): XmlElementDef {
  parent.children ||= [];
  let node = parent.children.find((c) => c.name === name);
  if (!node) {
    node = { name };
    parent.children.push(node);
  }
  return node;
}

function addAttr(node: XmlElementDef, attr: XmlAttrDef) {
  node.attrs ||= [];
  if (!node.attrs.some((a) => a.name === attr.name)) node.attrs.push(attr);
}

/** Walks a field's `path` from the root, returning the element it addresses. */
function nodeForPath(root: XmlElementDef, path: string[]): XmlElementDef {
  return path.reduce(childNode, root);
}

function docFor(field: PolicyField): string {
  const help = 'help' in field && field.help ? field.help : '';
  return help ? `${field.label} — ${help}` : field.label;
}

function applyField(root: XmlElementDef, field: PolicyField) {
  const node = nodeForPath(root, field.path);
  node.doc ||= docFor(field);

  switch (field.type) {
    case 'ref':
      node.takesVariable = true;
      break;
    case 'boolean':
      node.values ||= ['true', 'false'];
      break;
    case 'select':
      node.values ||= field.options;
      break;
    case 'attr':
      addAttr(node, { name: field.attr, doc: docFor(field), default: field.default });
      break;
    case 'attr-boolean':
      addAttr(node, { name: field.attr, doc: docFor(field), values: ['true', 'false'], default: field.default });
      break;
    case 'attr-select':
      addAttr(node, { name: field.attr, doc: docFor(field), values: field.options, default: field.default });
      break;
    case 'element':
      for (const attr of field.attrs || []) {
        addAttr(node, {
          name: attr.name,
          doc: attr.label,
          values: attr.kind === 'boolean' ? ['true', 'false'] : attr.options,
          default: attr.default,
        });
      }
      break;
    case 'kv-list': {
      // `<Headers>` holds repeated `<Header name="…">value</Header>`.
      const item = childNode(node, field.itemTag);
      item.repeatable = true;
      item.doc ||= `One ${field.itemTag.toLowerCase()} entry.`;
      addAttr(item, { name: field.nameAttr || 'name', doc: `${field.itemTag} name.` });
      break;
    }
    case 'string-list': {
      const item = childNode(node, field.itemTag);
      item.repeatable = true;
      item.doc ||= `One ${field.itemTag.toLowerCase()} entry.`;
      if (field.asAttr) addAttr(item, { name: field.attrName || 'name', doc: `${field.itemTag} name.` });
      break;
    }
    case 'ip-rules': {
      // AccessControl's rule list has a fixed shape the field type implies
      // rather than spells out, so it's the one case worth writing by hand.
      const rule = childNode(node, 'MatchRule');
      rule.repeatable = true;
      rule.doc ||= 'One IP match rule, evaluated top to bottom.';
      addAttr(rule, { name: 'action', values: ['ALLOW', 'DENY'], doc: 'What to do when this rule matches.' });
      const address = childNode(rule, 'SourceAddress');
      address.repeatable = true;
      address.doc ||= 'One address or CIDR range this rule covers.';
      addAttr(address, { name: 'mask', doc: 'CIDR mask bits, e.g. `24`.' });
      break;
    }
    default:
      break;
  }
}

/**
 * `type` (the gallery key) is not passed in: preset variants like `CorsHeaders`
 * render an `AssignMessage`, and it is the root tag in the document that the
 * providers look up.
 */
function deriveFromSchema(schema: PolicySchema): XmlElementDef {
  const root: XmlElementDef = { name: schema.rootTag, children: [DISPLAY_NAME] };
  for (const attr of schema.rootAttrs || []) {
    addAttr(root, {
      name: attr.name,
      doc: attr.label,
      values: attr.kind === 'select' ? attr.options : undefined,
      default: attr.default,
    });
  }
  for (const section of schema.sections) {
    for (const field of section.fields) applyField(root, field);
  }
  return root;
}

/** Built once: the schemas and the authored catalogue are both module constants. */
const CATALOG: Record<string, XmlElementDef> = (() => {
  const byRootTag: Record<string, XmlElementDef> = {};
  for (const schema of Object.values(POLICY_SCHEMAS)) {
    // First schema wins per root tag; the preset variants describe the same tag.
    byRootTag[schema.rootTag] ||= deriveFromSchema(schema);
  }
  // Authored entries replace a derived one outright rather than merging: where
  // both exist the authored tree is the more complete of the two, and a merge
  // would blend two element orders into something neither source vouches for.
  const catalog: Record<string, XmlElementDef> = { ...byRootTag, ...AUTHORED };

  for (const [rootTag, extras] of Object.entries(AUGMENTS)) {
    const tree = catalog[rootTag];
    if (!tree) continue;
    tree.children ||= [];
    for (const extra of extras) {
      if (!tree.children.some((c) => c.name === extra.name)) tree.children.push(extra);
    }
  }

  // Every policy root can carry these, so they are appended once here rather
  // than repeated in each authored tree.
  for (const tree of Object.values(catalog)) {
    tree.children ||= [];
    for (const universal of [DISPLAY_NAME, PROPERTIES]) {
      if (!tree.children.some((c) => c.name === universal.name)) tree.children.push(universal);
    }
  }

  return catalog;
})();

/** The element tree for a policy root tag, or undefined if we don't cover it. */
export function getPolicyElementTree(rootTag: string): XmlElementDef | undefined {
  return CATALOG[rootTag];
}

/** Root tags with element-level completion. Exported for tests and diagnostics. */
export function coveredPolicyTags(): string[] {
  return Object.keys(CATALOG).sort();
}

/**
 * Elements offered under any policy root we have no tree for, so an uncovered
 * policy type still gets the two elements every policy can carry rather than
 * nothing at all.
 */
export const FALLBACK_ROOT_CHILDREN: XmlElementDef[] = [DISPLAY_NAME, IGNORE_UNRESOLVED, PROPERTIES];
