import { deriveSchema } from './derivedPolicySchema';

// Declarative field schemas used to render a "Visual" (non-XML) editor for the
// most commonly used policy types. Each field maps to one XML element/attribute
// via `path` (the path, from the policy root, to that field's own element).
// Policy types without a schema here simply keep XML-only editing.

export interface RootAttrDef {
  name: string;
  label: string;
  kind: 'text' | 'select';
  options?: string[];
  default?: string;
}

interface FieldCommon {
  id: string;
  label: string;
  help?: string;
  required?: boolean;
}

export interface PFText extends FieldCommon {
  type: 'text' | 'number';
  path: string[];
  placeholder?: string;
  default?: string;
}

export interface PFRef extends FieldCommon {
  type: 'ref';
  path: string[];
  placeholder?: string;
  default?: string;
}

export interface PFBoolean extends FieldCommon {
  type: 'boolean';
  path: string[];
  default?: 'true' | 'false';
  omitIfDefault?: boolean;
}

export interface PFSelect extends FieldCommon {
  type: 'select';
  path: string[];
  options: string[];
  default?: string;
}

export interface PFAttr extends FieldCommon {
  type: 'attr';
  path: string[];
  attr: string;
  default?: string;
}

export interface PFAttrBoolean extends FieldCommon {
  type: 'attr-boolean';
  path: string[];
  attr: string;
  default?: 'true' | 'false';
}

export interface PFAttrSelect extends FieldCommon {
  type: 'attr-select';
  path: string[];
  attr: string;
  options: string[];
  default?: string;
}

export interface PFKvList extends FieldCommon {
  type: 'kv-list';
  path: string[];
  itemTag: string;
  nameAttr?: string;
  /**
   * Set these when the pair is carried by two child elements rather than a
   * name attribute and text — CloudLogging's <Label><Key/><Value/></Label>,
   * as against the <Header name="..."> shape every other list uses.
   */
  keyTag?: string;
  valueTag?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}

/**
 * A repeating element keyed by its own attributes, holding one or more value
 * elements — the shape ExtractVariables is built from:
 *
 *   <QueryParam name="code"><Pattern ignoreCase="true">DBN{dbncode}</Pattern></QueryParam>
 *   <Variable name="latitude" type="float"><JSONPath>$.results[0]…</JSONPath></Variable>
 *
 * `valueTag` is optional: without it the item's own text is the value, which is
 * what <URIPath><Pattern ignoreCase="true">…</Pattern></URIPath> needs.
 */
export interface PFNamedItems extends FieldCommon {
  type: 'named-items';
  /** The container. Empty means the items sit directly under the policy root. */
  path: string[];
  itemTag: string;
  itemAttrs?: PFElementAttr[];
  valueTag?: string;
  valueAttrs?: PFElementAttr[];
  valueLabel?: string;
  valuePlaceholder?: string;
  /** Label for the button that adds a row. */
  addLabel?: string;
}

/**
 * AssignMessage's <AssignVariable>: a repeating element with a <Name> and
 * exactly one source, picked from <Value> (a literal), <Ref> (a flow variable)
 * or <Template> (a message template). It's the most-used thing the visual
 * editor had no field for at all.
 */
export interface PFAssignVariables extends FieldCommon {
  type: 'assign-variables';
  path: string[];
  itemTag: string;
}

export interface PFStringList extends FieldCommon {
  type: 'string-list';
  path: string[];
  itemTag: string;
  asAttr?: boolean;
  attrName?: string;
  placeholder?: string;
}

export interface PFElementAttr {
  name: string;
  label: string;
  kind: 'text' | 'boolean' | 'select';
  options?: string[];
  default?: string;
}

export interface PFElement extends FieldCommon {
  type: 'element';
  path: string[];
  attrs?: PFElementAttr[];
  hasText?: boolean;
  textLabel?: string;
  textPlaceholder?: string;
}

export interface PFIpRules extends FieldCommon {
  type: 'ip-rules';
  path: string[];
}

export type PolicyField =
  | PFText
  | PFRef
  | PFBoolean
  | PFSelect
  | PFAttr
  | PFAttrBoolean
  | PFAttrSelect
  | PFKvList
  | PFStringList
  | PFElement
  | PFIpRules
  | PFAssignVariables
  | PFNamedItems;

export interface PolicyFieldSection {
  title: string;
  fields: PolicyField[];
  /** Shown above the fields — what this section can't edit, and why. */
  note?: string;
}

export interface PolicySchema {
  rootTag: string;
  rootAttrs?: RootAttrDef[];
  sections: PolicyFieldSection[];
  /**
   * Built from the generated reference catalogue rather than written by hand.
   * The editor says so, because a derived schema groups fields the way the
   * documentation does and has no opinion about which of them matter.
   */
  derived?: boolean;
}

const VERBS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const POLICY_SCHEMAS: Record<string, PolicySchema> = {
  AssignMessage: {
    rootTag: 'AssignMessage',
    sections: [
      {
        title: 'Assign To',
        fields: [
          {
            id: 'assignTo',
            type: 'element',
            label: 'Assign To',
            path: ['AssignTo'],
            hasText: true,
            textLabel: 'Variable name (blank = current message)',
            attrs: [
              { name: 'createNew', label: 'Create new message', kind: 'boolean', default: 'false' },
              { name: 'type', label: 'Type', kind: 'select', options: ['request', 'response'], default: 'response' },
              { name: 'transport', label: 'Transport', kind: 'text', default: 'http' },
            ],
          },
        ],
      },
      {
        title: 'Set',
        fields: [
          { id: 'setHeaders', type: 'kv-list', label: 'Set Headers', path: ['Set', 'Headers'], itemTag: 'Header', keyPlaceholder: 'Content-Type', valuePlaceholder: 'application/json' },
          { id: 'setQueryParams', type: 'kv-list', label: 'Set Query Params', path: ['Set', 'QueryParams'], itemTag: 'QueryParam' },
          { id: 'setFormParams', type: 'kv-list', label: 'Set Form Params', path: ['Set', 'FormParams'], itemTag: 'FormParam' },
          {
            id: 'setPayload',
            type: 'element',
            label: 'Set Payload',
            path: ['Set', 'Payload'],
            hasText: true,
            textLabel: 'Payload body',
            attrs: [{ name: 'contentType', label: 'Content-Type', kind: 'text', default: 'application/json' }],
          },
          { id: 'setVerb', type: 'select', label: 'Set Verb', path: ['Set', 'Verb'], options: VERBS },
          { id: 'setVersion', type: 'text', label: 'Set Version', path: ['Set', 'Version'], placeholder: '1.1' },
          { id: 'setPath', type: 'text', label: 'Set Path', path: ['Set', 'Path'] },
          { id: 'setStatusCode', type: 'number', label: 'Set Status Code', path: ['Set', 'StatusCode'] },
          { id: 'setReasonPhrase', type: 'text', label: 'Set Reason Phrase', path: ['Set', 'ReasonPhrase'] },
        ],
      },
      {
        title: 'Add',
        fields: [
          { id: 'addHeaders', type: 'kv-list', label: 'Add Headers', path: ['Add', 'Headers'], itemTag: 'Header' },
          { id: 'addQueryParams', type: 'kv-list', label: 'Add Query Params', path: ['Add', 'QueryParams'], itemTag: 'QueryParam' },
          { id: 'addFormParams', type: 'kv-list', label: 'Add Form Params', path: ['Add', 'FormParams'], itemTag: 'FormParam' },
        ],
      },
      {
        title: 'Remove',
        fields: [
          { id: 'removeHeaders', type: 'string-list', label: 'Remove Headers (by name)', path: ['Remove', 'Headers'], itemTag: 'Header', asAttr: true, placeholder: 'X-Remove-Me' },
          { id: 'removeQueryParams', type: 'string-list', label: 'Remove Query Params (by name)', path: ['Remove', 'QueryParams'], itemTag: 'QueryParam', asAttr: true },
          { id: 'removeFormParams', type: 'string-list', label: 'Remove Form Params (by name)', path: ['Remove', 'FormParams'], itemTag: 'FormParam', asAttr: true },
          { id: 'removePayload', type: 'boolean', label: 'Remove Payload', path: ['Remove', 'Payload'], default: 'false', omitIfDefault: true },
        ],
      },
      {
        // A <Copy> with no children copies the *whole* source message, so each
        // of these is opt-in and absent by default.
        title: 'Copy',
        fields: [
          { id: 'copySource', type: 'attr-select', label: 'Copy From', path: ['Copy'], attr: 'source', options: ['request', 'response'] },
          { id: 'copyHeaders', type: 'string-list', label: 'Copy Headers (by name)', path: ['Copy', 'Headers'], itemTag: 'Header', asAttr: true },
          { id: 'copyQueryParams', type: 'string-list', label: 'Copy Query Params (by name)', path: ['Copy', 'QueryParams'], itemTag: 'QueryParam', asAttr: true },
          { id: 'copyFormParams', type: 'string-list', label: 'Copy Form Params (by name)', path: ['Copy', 'FormParams'], itemTag: 'FormParam', asAttr: true },
          { id: 'copyPayload', type: 'boolean', label: 'Copy Payload', path: ['Copy', 'Payload'], default: 'false', omitIfDefault: true },
          { id: 'copyPath', type: 'boolean', label: 'Copy Path', path: ['Copy', 'Path'], default: 'false', omitIfDefault: true },
          { id: 'copyVerb', type: 'boolean', label: 'Copy Verb', path: ['Copy', 'Verb'], default: 'false', omitIfDefault: true },
          { id: 'copyVersion', type: 'boolean', label: 'Copy Version', path: ['Copy', 'Version'], default: 'false', omitIfDefault: true },
          { id: 'copyStatusCode', type: 'boolean', label: 'Copy Status Code', path: ['Copy', 'StatusCode'], default: 'false', omitIfDefault: true },
        ],
      },
      {
        title: 'Assign Variables',
        fields: [
          {
            id: 'assignVariables',
            type: 'assign-variables',
            label: 'Assign Variable',
            path: [],
            itemTag: 'AssignVariable',
            help: 'Creates the flow variable if it does not exist, and runs in the order listed.',
          },
        ],
      },
      {
        title: 'Options',
        fields: [{ id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'true' }],
      },
    ],
  },

  VerifyAPIKey: {
    rootTag: 'VerifyAPIKey',
    sections: [
      {
        title: 'API Key',
        fields: [
          { id: 'apiKey', type: 'ref', label: 'API Key', path: ['APIKey'], required: true, default: 'request.queryparam.apikey', help: 'Variable holding the key sent by the client.' },
          { id: 'cacheExpiry', type: 'ref', label: 'Cache Expiry (seconds)', path: ['CacheExpiryInSeconds'], help: 'How long a successful verification stays cached.' },
        ],
      },
    ],
  },

  OAuthV2: {
    rootTag: 'OAuthV2',
    sections: [
      {
        title: 'Operation',
        fields: [
          {
            id: 'operation',
            type: 'select',
            label: 'Operation',
            path: ['Operation'],
            required: true,
            default: 'VerifyAccessToken',
            options: ['GenerateAccessToken', 'RefreshAccessToken', 'VerifyAccessToken', 'GenerateAuthorizationCode', 'InvalidateToken', 'GenerateIDToken'],
          },
          { id: 'generateResponse', type: 'attr-boolean', label: 'Generate Response', path: ['GenerateResponse'], attr: 'enabled', default: 'true' },
        ],
      },
      {
        title: 'Token Settings (GenerateAccessToken)',
        fields: [
          { id: 'expiresIn', type: 'number', label: 'Expires In (ms, -1 = org default)', path: ['ExpiresIn'], default: '3600000' },
          { id: 'refreshExpiresIn', type: 'number', label: 'Refresh Token Expires In (ms)', path: ['RefreshTokenExpiresIn'] },
          { id: 'grantTypes', type: 'string-list', label: 'Supported Grant Types', path: ['SupportedGrantTypes'], itemTag: 'GrantType', placeholder: 'client_credentials' },
          { id: 'scope', type: 'text', label: 'Scope', path: ['Scope'], placeholder: 'read write' },
        ],
      },
      {
        title: 'Credentials / Tokens',
        fields: [
          { id: 'userName', type: 'ref', label: 'Username', path: ['UserName'] },
          { id: 'password', type: 'ref', label: 'Password', path: ['PassWord'] },
          { id: 'clientId', type: 'ref', label: 'Client ID', path: ['ClientId'] },
          { id: 'code', type: 'ref', label: 'Authorization Code', path: ['Code'] },
          { id: 'redirectUri', type: 'ref', label: 'Redirect URI', path: ['RedirectUri'] },
          { id: 'accessToken', type: 'ref', label: 'Access Token (VerifyAccessToken)', path: ['AccessToken'] },
          { id: 'appEndUser', type: 'ref', label: 'App End User', path: ['AppEndUser'] },
        ],
      },
      {
        title: 'Behaviour',
        fields: [
          { id: 'accessTokenPrefix', type: 'text', label: 'Access Token Prefix', path: ['AccessTokenPrefix'], placeholder: 'Bearer' },
          { id: 'storeToken', type: 'boolean', label: 'Store Token (external authorization)', path: ['StoreToken'], default: 'false', omitIfDefault: true },
          { id: 'reuseRefreshToken', type: 'boolean', label: 'Reuse Refresh Token', path: ['ReuseRefreshToken'], default: 'false', omitIfDefault: true },
          {
            id: 'rfcCompliant',
            type: 'boolean',
            label: 'RFC-Compliant Request/Response',
            path: ['RFCCompliantRequestResponse'],
            default: 'false',
            omitIfDefault: true,
            help: 'Aligns the error responses and token payloads with RFC 6749.',
          },
        ],
      },
    ],
  },

  VerifyJWT: {
    rootTag: 'VerifyJWT',
    sections: [
      {
        title: 'Signature',
        fields: [
          {
            id: 'algorithm',
            type: 'select',
            label: 'Algorithm',
            path: ['Algorithm'],
            required: true,
            default: 'RS256',
            options: ['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512', 'PS256'],
          },
          { id: 'source', type: 'text', label: 'Source', path: ['Source'], default: 'request.header.Authorization' },
          { id: 'secretKey', type: 'ref', label: 'Secret Key (HS*)', path: ['SecretKey', 'Value'], help: 'For symmetric algorithms.' },
          { id: 'jwksUri', type: 'attr', label: 'Public Key JWKS URI (RS*/ES*/PS*)', path: ['PublicKey', 'JWKS'], attr: 'uri', help: 'For asymmetric algorithms.' },
          { id: 'publicKeyValue', type: 'ref', label: 'Public Key PEM (RS*/ES*/PS*)', path: ['PublicKey', 'Value'], help: 'An alternative to JWKS: the key itself, usually via a variable.' },
          { id: 'jwtType', type: 'select', label: 'Type', path: ['Type'], options: ['', 'Signed', 'Encrypted'], help: 'Leave blank for a signed JWT.' },
        ],
      },
      {
        title: 'Claim Validation',
        fields: [
          { id: 'issuer', type: 'ref', label: 'Issuer', path: ['Issuer'] },
          { id: 'audience', type: 'text', label: 'Audience', path: ['Audience'] },
          { id: 'subject', type: 'ref', label: 'Subject', path: ['Subject'] },
          { id: 'additionalClaims', type: 'kv-list', label: 'Additional Claims', path: ['AdditionalClaims'], itemTag: 'Claim', keyPlaceholder: 'claim name', valuePlaceholder: 'expected value' },
          { id: 'ignoreIssuedAt', type: 'boolean', label: 'Ignore Issued-At', path: ['IgnoreIssuedAt'], default: 'false', omitIfDefault: true },
          { id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'false', omitIfDefault: true },
          {
            id: 'timeAllowance',
            type: 'text',
            label: 'Time Allowance (clock skew)',
            path: ['TimeAllowance'],
            placeholder: '60s',
            help: 'Grace period applied to the exp and nbf claims, e.g. 120s or 10m.',
          },
        ],
      },
    ],
  },

  Quota: {
    rootTag: 'Quota',
    // Three counter strategies, not two: `calendar` resets relative to
    // StartTime, `rollingwindow` recalculates a lookback window on every
    // request (the counter never resets), and `flexi` starts the clock on the
    // first request from an app. Omitting `type` uses the default bucket
    // (top of the hour, midnight GMT, and so on).
    rootAttrs: [{ name: 'type', label: 'Type', kind: 'select', options: ['calendar', 'rollingwindow', 'flexi'], default: 'calendar' }],
    sections: [
      {
        title: 'Allowance',
        fields: [
          {
            id: 'allow',
            type: 'element',
            label: 'Allow',
            path: ['Allow'],
            hasText: true,
            textLabel: 'Count',
            required: true,
            attrs: [
              { name: 'count', label: 'Count', kind: 'text' },
              { name: 'countRef', label: 'Count variable (wins over the literal when it resolves)', kind: 'text' },
            ],
          },
          { id: 'interval', type: 'number', label: 'Interval', path: ['Interval'], required: true, default: '1' },
          { id: 'timeUnit', type: 'select', label: 'Time Unit', path: ['TimeUnit'], required: true, default: 'day', options: ['minute', 'hour', 'day', 'week', 'month'] },
          {
            id: 'startTime',
            type: 'text',
            label: 'Start Time',
            path: ['StartTime'],
            placeholder: '2026-01-01 00:00:00',
            help: 'Required when type is "calendar". UTC, ISO 8601 (YYYY-MM-DD HH:MM:SS).',
          },
        ],
      },
      {
        title: 'Bucketing',
        fields: [
          { id: 'identifier', type: 'ref', label: 'Identifier', path: ['Identifier'], help: 'Buckets the quota counter per caller. Mutually exclusive with Class.' },
          {
            // <Class> hangs off <Allow>, and holds one <Allow class="..." count="..."/>
            // per bucket. Only the ref is editable here; the per-class counts
            // are a repeating structure the XML tab still owns.
            id: 'allowClassRef',
            type: 'attr',
            label: 'Allow Class (variable)',
            path: ['Allow', 'Class'],
            attr: 'ref',
            help: 'Picks the <Allow class="..."> bucket to count against. Add the per-class counts in the XML tab.',
          },
          { id: 'messageWeight', type: 'ref', label: 'Message Weight', path: ['MessageWeight'], help: 'Weights each call — e.g. an LLM response token count extracted upstream.' },
        ],
      },
      {
        // SharedName + EnforceOnly + CountOnly are one feature: check the quota
        // on the incoming request, then accrue the real cost in the response
        // flow once the target has told you what it was. Both policies must
        // carry the same SharedName.
        title: 'Split enforce / count (shared counter)',
        fields: [
          { id: 'sharedName', type: 'text', label: 'Shared Name', path: ['SharedName'], help: 'Ties an enforce-only and a count-only policy to one counter.' },
          { id: 'enforceOnly', type: 'boolean', label: 'Enforce Only (check, do not increment)', path: ['EnforceOnly'], default: 'false', omitIfDefault: true },
          { id: 'countOnly', type: 'boolean', label: 'Count Only (increment, do not check)', path: ['CountOnly'], default: 'false', omitIfDefault: true },
        ],
      },
      {
        title: 'Advanced',
        fields: [
          { id: 'distributed', type: 'boolean', label: 'Distributed', path: ['Distributed'], default: 'true', omitIfDefault: true },
          { id: 'synchronous', type: 'boolean', label: 'Synchronous', path: ['Synchronous'], default: 'false', omitIfDefault: true },
          {
            id: 'syncIntervalInSeconds',
            type: 'number',
            label: 'Async sync interval (seconds)',
            path: ['AsynchronousConfiguration', 'SyncIntervalInSeconds'],
            help: 'Only meaningful when Synchronous is false.',
          },
          { id: 'syncMessageCount', type: 'number', label: 'Async sync message count', path: ['AsynchronousConfiguration', 'SyncMessageCount'] },
        ],
      },
      {
        // <UseQuotaConfigInAPIProduct> is a container, NOT a boolean: its
        // presence turns the feature on, and the stepName attribute names the
        // VerifyAPIKey/OAuthV2 policy that resolved the API product.
        // <DefaultConfig> supplies the fallback used when the product carries
        // no quota settings of its own. Adding this element makes Apigee IGNORE
        // the Allow/Interval/TimeUnit set above.
        title: 'Use quota config from the API product',
        fields: [
          {
            id: 'useProductConfigStep',
            type: 'attr',
            label: 'Resolved by policy (stepName)',
            path: ['UseQuotaConfigInAPIProduct'],
            attr: 'stepName',
            help: 'Name of the VerifyAPIKey or OAuthV2 policy that identified the API product. Setting this makes Apigee ignore the Allowance section above.',
          },
          {
            id: 'productDefaultAllow',
            type: 'element',
            label: 'Default Allow',
            path: ['UseQuotaConfigInAPIProduct', 'DefaultConfig', 'Allow'],
            attrs: [{ name: 'count', label: 'Count', kind: 'text' }],
            help: 'Used when the API product itself defines no quota.',
          },
          { id: 'productDefaultInterval', type: 'number', label: 'Default Interval', path: ['UseQuotaConfigInAPIProduct', 'DefaultConfig', 'Interval'] },
          {
            id: 'productDefaultTimeUnit',
            type: 'select',
            label: 'Default Time Unit',
            path: ['UseQuotaConfigInAPIProduct', 'DefaultConfig', 'TimeUnit'],
            options: ['minute', 'hour', 'day', 'week', 'month'],
          },
        ],
      },
    ],
  },

  SpikeArrest: {
    rootTag: 'SpikeArrest',
    sections: [
      {
        title: 'Rate',
        fields: [
          { id: 'rate', type: 'ref', label: 'Rate', path: ['Rate'], required: true, default: '30ps', help: 'Format intPS ("ps") or intPM ("pm"), e.g. 30ps, 10pm.' },
          { id: 'identifier', type: 'ref', label: 'Identifier', path: ['Identifier'], help: 'Buckets the rate per unique value instead of one shared global bucket.' },
          { id: 'messageWeight', type: 'ref', label: 'Message Weight', path: ['MessageWeight'] },
          { id: 'useEffectiveCount', type: 'boolean', label: 'Use Effective Count', path: ['UseEffectiveCount'], default: 'false', omitIfDefault: true },
        ],
      },
    ],
  },

  CORS: {
    rootTag: 'CORS',
    sections: [
      {
        title: 'Origins & Methods',
        fields: [
          {
            id: 'allowOrigins',
            type: 'text',
            label: 'Allow Origins',
            path: ['AllowOrigins'],
            default: '*',
            placeholder: 'https://app.example.com,https://admin.example.com',
            help: 'A list, "*", or a flow variable such as {request.header.origin} — there is no separate "ref" element.',
          },
          { id: 'allowMethods', type: 'text', label: 'Allow Methods', path: ['AllowMethods'], default: 'GET, PUT, POST, DELETE, OPTIONS' },
          { id: 'allowHeaders', type: 'text', label: 'Allow Headers', path: ['AllowHeaders'], default: 'origin, x-requested-with, accept, content-type, authorization' },
          { id: 'exposeHeaders', type: 'text', label: 'Expose Headers', path: ['ExposeHeaders'] },
        ],
      },
      {
        title: 'Behavior',
        fields: [
          { id: 'maxAge', type: 'number', label: 'Max Age (seconds)', path: ['MaxAge'], default: '3628800' },
          { id: 'allowCredentials', type: 'boolean', label: 'Allow Credentials', path: ['AllowCredentials'], default: 'false', omitIfDefault: true },
          {
            id: 'generatePreflightResponse',
            type: 'boolean',
            label: 'Generate Preflight Response',
            path: ['GeneratePreflightResponse'],
            default: 'true',
            help: 'Answers the OPTIONS preflight in the proxy instead of passing it to the target.',
          },
          { id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'true' },
        ],
      },
    ],
  },

  RaiseFault: {
    rootTag: 'RaiseFault',
    sections: [
      {
        title: 'Fault Response',
        fields: [
          { id: 'statusCode', type: 'number', label: 'Status Code', path: ['FaultResponse', 'Set', 'StatusCode'], required: true, default: '400' },
          { id: 'reasonPhrase', type: 'text', label: 'Reason Phrase', path: ['FaultResponse', 'Set', 'ReasonPhrase'], default: 'Bad Request' },
          {
            id: 'payload',
            type: 'element',
            label: 'Payload',
            path: ['FaultResponse', 'Set', 'Payload'],
            hasText: true,
            textLabel: 'Body',
            attrs: [{ name: 'contentType', label: 'Content-Type', kind: 'text', default: 'application/json' }],
          },
          { id: 'headers', type: 'kv-list', label: 'Set Headers', path: ['FaultResponse', 'Set', 'Headers'], itemTag: 'Header' },
          { id: 'addHeaders', type: 'kv-list', label: 'Add Headers', path: ['FaultResponse', 'Add', 'Headers'], itemTag: 'Header' },
          { id: 'copySource', type: 'attr-select', label: 'Copy From', path: ['FaultResponse', 'Copy'], attr: 'source', options: ['request', 'response'] },
          { id: 'copyStatusCode', type: 'boolean', label: 'Copy Status Code', path: ['FaultResponse', 'Copy', 'StatusCode'], default: 'false', omitIfDefault: true },
        ],
      },
      {
        title: 'Options',
        fields: [{ id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'true' }],
      },
    ],
  },

  ServiceCallout: {
    rootTag: 'ServiceCallout',
    sections: [
      {
        title: 'Request',
        fields: [
          {
            id: 'request',
            type: 'element',
            label: 'Request',
            path: ['Request'],
            attrs: [
              { name: 'variable', label: 'Request Variable', kind: 'text' },
              { name: 'clearPayload', label: 'Clear Payload', kind: 'boolean', default: 'true' },
            ],
          },
          { id: 'verb', type: 'select', label: 'Verb', path: ['Request', 'Set', 'Verb'], options: VERBS, default: 'GET' },
          { id: 'path', type: 'text', label: 'Path', path: ['Request', 'Set', 'Path'] },
          { id: 'headers', type: 'kv-list', label: 'Headers', path: ['Request', 'Set', 'Headers'], itemTag: 'Header' },
          { id: 'queryParams', type: 'kv-list', label: 'Query Params', path: ['Request', 'Set', 'QueryParams'], itemTag: 'QueryParam' },
          { id: 'requestIgnoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables (request)', path: ['Request', 'IgnoreUnresolvedVariables'], default: 'false', omitIfDefault: true },
          {
            id: 'payload',
            type: 'element',
            label: 'Payload',
            path: ['Request', 'Set', 'Payload'],
            hasText: true,
            textLabel: 'Body',
            attrs: [{ name: 'contentType', label: 'Content-Type', kind: 'text', default: 'application/json' }],
          },
        ],
      },
      {
        title: 'Target',
        fields: [
          { id: 'response', type: 'text', label: 'Response Variable', path: ['Response'], required: true, placeholder: 'calloutResponse' },
          { id: 'url', type: 'text', label: 'Target URL', path: ['HTTPTargetConnection', 'URL'], help: 'Mutually exclusive with Load Balancer Server below.' },
          {
            id: 'lbServer',
            type: 'element',
            label: 'Load Balancer Server',
            path: ['HTTPTargetConnection', 'LoadBalancer', 'Server'],
            attrs: [{ name: 'name', label: 'Target Server name', kind: 'text' }],
          },
        ],
      },
      {
        // Calls another proxy in the same environment without a network hop.
        // Mutually exclusive with the HTTPTargetConnection above.
        title: 'Local Target (another proxy in this environment)',
        fields: [
          { id: 'localApiProxy', type: 'text', label: 'API Proxy', path: ['LocalTargetConnection', 'APIProxy'] },
          { id: 'localProxyEndpoint', type: 'text', label: 'Proxy Endpoint', path: ['LocalTargetConnection', 'ProxyEndpoint'], placeholder: 'default' },
          { id: 'localPath', type: 'text', label: 'Path', path: ['LocalTargetConnection', 'Path'], help: 'Use instead of API Proxy / Proxy Endpoint to route by base path.' },
          { id: 'targetPath', type: 'text', label: 'Target Path', path: ['HTTPTargetConnection', 'Path'], help: 'Appended to the URL or load-balanced target server.' },
          { id: 'lbAlgorithm', type: 'select', label: 'Load Balancer Algorithm', path: ['HTTPTargetConnection', 'LoadBalancer', 'Algorithm'], options: ['', 'RoundRobin', 'Weighted', 'LeastConnections'] },
          { id: 'timeout', type: 'number', label: 'Timeout (ms)', path: ['Timeout'], default: '30000' },
        ],
      },
    ],
  },

  BasicAuthentication: {
    rootTag: 'BasicAuthentication',
    sections: [
      {
        title: 'Operation',
        fields: [
          { id: 'operation', type: 'select', label: 'Operation', path: ['Operation'], required: true, default: 'Decode', options: ['Encode', 'Decode'] },
          { id: 'user', type: 'ref', label: 'User (Encode)', path: ['User'] },
          { id: 'password', type: 'ref', label: 'Password (Encode)', path: ['Password'] },
          { id: 'source', type: 'text', label: 'Source (Decode)', path: ['Source'], default: 'request.header.Authorization' },
          {
            id: 'assignTo',
            type: 'element',
            label: 'Assign To',
            path: ['AssignTo'],
            required: true,
            hasText: true,
            textLabel: 'Variable',
            textPlaceholder: 'request.header.Authorization',
            attrs: [{ name: 'createNew', label: 'Create new', kind: 'boolean', default: 'false' }],
          },
        ],
      },
      {
        title: 'Options',
        fields: [{ id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'true' }],
      },
    ],
  },

  // <CloudLogging> and <Syslog> are mutually exclusive — fill in one section
  // or the other, never both, or Apigee rejects the policy at deploy time.
  MessageLogging: {
    rootTag: 'MessageLogging',
    sections: [
      {
        title: 'Cloud Logging (native on Apigee X)',
        fields: [
          {
            id: 'logName',
            type: 'text',
            label: 'Log Name',
            path: ['CloudLogging', 'LogName'],
            placeholder: 'projects/{organization.name}/logs/apigee-proxy-log',
            help: 'Requires the Cloud Logging API enabled on the project.',
          },
          {
            id: 'cloudMessage',
            type: 'element',
            label: 'Message',
            path: ['CloudLogging', 'Message'],
            hasText: true,
            textLabel: 'Message template',
            attrs: [{ name: 'contentType', label: 'Content-Type', kind: 'text', default: 'application/json' }],
          },
          {
            id: 'labels',
            type: 'kv-list',
            label: 'Labels',
            path: ['CloudLogging', 'Labels'],
            itemTag: 'Label',
            keyTag: 'Key',
            valueTag: 'Value',
            keyPlaceholder: 'env',
            valuePlaceholder: 'prod',
          },
          { id: 'resourceType', type: 'text', label: 'Resource Type (optional)', path: ['CloudLogging', 'ResourceType'], placeholder: 'global', help: 'Defaults to "global" when omitted.' },
          { id: 'endpoint', type: 'text', label: 'Endpoint (optional)', path: ['CloudLogging', 'Endpoint'], placeholder: 'logging.us.rep.googleapis.com:443' },
        ],
      },
      {
        title: 'Syslog (external sink)',
        fields: [
          { id: 'message', type: 'text', label: 'Message Template', path: ['Syslog', 'Message'], placeholder: '{system.time} {request.verb} {request.uri}' },
          { id: 'host', type: 'text', label: 'Host', path: ['Syslog', 'Host'], placeholder: 'syslog.example.com' },
          { id: 'port', type: 'number', label: 'Port', path: ['Syslog', 'Port'], default: '514' },
          { id: 'protocol', type: 'select', label: 'Protocol', path: ['Syslog', 'Protocol'], default: 'UDP', options: ['UDP', 'TCP'], help: 'UDP is the Apigee default; TCP guarantees delivery and is required for TLS.' },
          { id: 'formatMessage', type: 'boolean', label: 'Format Message', path: ['Syslog', 'FormatMessage'], default: 'false', omitIfDefault: true, help: 'Prepends a priority score and timestamp. Required by Loggly.' },
          { id: 'payloadOnly', type: 'boolean', label: 'Payload Only', path: ['Syslog', 'PayloadOnly'], default: 'false', omitIfDefault: true, help: 'Logs the message body alone, with no Apigee-generated prefix.' },
          { id: 'dateFormat', type: 'text', label: 'Date Format', path: ['Syslog', 'DateFormat'], placeholder: 'yyyy-MM-dd HH:mm:ss.SSS' },
          { id: 'syslogSsl', type: 'boolean', label: 'TLS/SSL (TCP only)', path: ['Syslog', 'SSLInfo', 'Enabled'], default: 'false', omitIfDefault: true },
        ],
      },
      {
        title: 'Options',
        fields: [
          { id: 'logLevel', type: 'select', label: 'Log Level', path: ['logLevel'], options: ['INFO', 'ALERT', 'WARN', 'ERROR', 'DEBUG'] },
        ],
      },
    ],
  },

  AccessControl: {
    rootTag: 'AccessControl',
    sections: [
      {
        title: 'IP Rules',
        fields: [
          { id: 'noRuleMatchAction', type: 'attr-select', label: 'When no rule matches', path: ['IPRules'], attr: 'noRuleMatchAction', options: ['ALLOW', 'DENY'], default: 'ALLOW' },
          { id: 'rules', type: 'ip-rules', label: 'Match Rules', path: ['IPRules'] },
          {
            id: 'validateBasedOn',
            type: 'select',
            label: 'Validate Based On',
            path: ['ValidateBasedOn'],
            options: ['', 'X_FORWARDED_FOR_IP', 'CLIENT_IP'],
            help: 'Which address the rules match against. Behind a load balancer that is usually X_FORWARDED_FOR_IP.',
          },
          { id: 'clientIpVariable', type: 'ref', label: 'Client IP Variable', path: ['ClientIPVariable'], help: 'Match against a variable you populated yourself instead.' },
        ],
      },
    ],
  },

  // The one policy whose whole job is a repeating structure: every source it
  // can read from is a list of "pull this expression into that variable".
  // Deriving it from the reference produced a section per source and no way to
  // add a second <QueryParam>, which is the only thing anyone needs it for.
  ExtractVariables: {
    rootTag: 'ExtractVariables',
    sections: [
      {
        title: 'Source',
        fields: [
          {
            id: 'source',
            type: 'element',
            label: 'Source',
            path: ['Source'],
            hasText: true,
            textLabel: 'Message to read from',
            textPlaceholder: 'request',
            attrs: [{ name: 'clearPayload', label: 'Clear payload after extracting', kind: 'boolean', default: 'false' }],
            help: 'Blank reads whichever message the flow is handling.',
          },
          {
            id: 'variablePrefix',
            type: 'text',
            label: 'Variable Prefix',
            path: ['VariablePrefix'],
            placeholder: 'myprefix',
            help: 'Extracted values land in PREFIX.NAME. Without it they are created without a namespace.',
          },
          {
            id: 'ignoreUnresolved',
            type: 'boolean',
            label: 'Ignore Unresolved Variables',
            path: ['IgnoreUnresolvedVariables'],
            default: 'false',
            omitIfDefault: true,
          },
        ],
      },
      {
        title: 'URI Path',
        fields: [
          {
            id: 'uriPath',
            type: 'named-items',
            label: 'Patterns',
            path: ['URIPath'],
            itemTag: 'Pattern',
            itemAttrs: [{ name: 'ignoreCase', label: 'Ignore case', kind: 'boolean', default: 'false' }],
            valuePlaceholder: '/accounts/{id}',
            addLabel: 'Add pattern',
            help: 'Braces name the variable to create: /accounts/{id} sets id.',
          },
        ],
      },
      {
        title: 'Query Parameters',
        fields: [
          {
            id: 'queryParams',
            type: 'named-items',
            label: 'Query Params',
            path: [],
            itemTag: 'QueryParam',
            itemAttrs: [{ name: 'name', label: 'Query param name', kind: 'text' }],
            valueTag: 'Pattern',
            valueAttrs: [{ name: 'ignoreCase', label: 'Ignore case', kind: 'boolean', default: 'false' }],
            valueLabel: 'pattern',
            valuePlaceholder: 'DBN{dbncode}',
            addLabel: 'Add query param',
            help: 'Repeat the same name as "w", "w.2", "w.3" to read a multi-valued parameter.',
          },
        ],
      },
      {
        title: 'Headers',
        fields: [
          {
            id: 'headers',
            type: 'named-items',
            label: 'Headers',
            path: [],
            itemTag: 'Header',
            itemAttrs: [{ name: 'name', label: 'Header name', kind: 'text' }],
            valueTag: 'Pattern',
            valueAttrs: [{ name: 'ignoreCase', label: 'Ignore case', kind: 'boolean', default: 'false' }],
            valueLabel: 'pattern',
            valuePlaceholder: '{server}',
            addLabel: 'Add header',
          },
        ],
      },
      {
        title: 'Form Parameters',
        fields: [
          {
            id: 'formParams',
            type: 'named-items',
            label: 'Form Params',
            path: [],
            itemTag: 'FormParam',
            itemAttrs: [{ name: 'name', label: 'Form param name', kind: 'text' }],
            valueTag: 'Pattern',
            valueLabel: 'pattern',
            addLabel: 'Add form param',
            help: 'Only read when the Content-Type is application/x-www-form-urlencoded.',
          },
        ],
      },
      {
        title: 'From Another Variable',
        fields: [
          {
            id: 'variables',
            type: 'named-items',
            label: 'Variables',
            path: [],
            itemTag: 'Variable',
            itemAttrs: [{ name: 'name', label: 'Source variable', kind: 'text' }],
            valueTag: 'Pattern',
            valueLabel: 'pattern',
            addLabel: 'Add variable',
            help: 'Reads a flow variable that already exists and extracts from its value.',
          },
        ],
      },
      {
        title: 'JSON Payload',
        fields: [
          {
            id: 'jsonVariables',
            type: 'named-items',
            label: 'JSON Path Variables',
            path: ['JSONPayload'],
            itemTag: 'Variable',
            itemAttrs: [
              { name: 'name', label: 'Variable name', kind: 'text' },
              { name: 'type', label: 'Type', kind: 'select', options: ['', 'string', 'boolean', 'integer', 'long', 'float', 'double', 'nodeset'] },
            ],
            valueTag: 'JSONPath',
            valueLabel: 'JSON path',
            valuePlaceholder: '$.results[0].geometry.location.lat',
            addLabel: 'Add JSON variable',
            help: 'Only read when the Content-Type is application/json.',
          },
        ],
      },
      {
        title: 'XML Payload',
        fields: [
          {
            id: 'stopPayloadProcessing',
            type: 'attr-boolean',
            label: 'Stop After First Match',
            path: ['XMLPayload'],
            attr: 'stopPayloadProcessing',
            default: 'false',
          },
          {
            id: 'namespaces',
            type: 'kv-list',
            label: 'Namespaces',
            path: ['XMLPayload', 'Namespaces'],
            itemTag: 'Namespace',
            nameAttr: 'prefix',
            keyPlaceholder: 'apigee',
            valuePlaceholder: 'http://www.apigee.com',
            help: 'Any prefix used in an XPath below must be declared here first.',
          },
          {
            id: 'xmlVariables',
            type: 'named-items',
            label: 'XPath Variables',
            path: ['XMLPayload'],
            itemTag: 'Variable',
            itemAttrs: [
              { name: 'name', label: 'Variable name', kind: 'text' },
              { name: 'type', label: 'Type', kind: 'select', options: ['', 'string', 'boolean', 'integer', 'long', 'float', 'double', 'nodeset'] },
            ],
            valueTag: 'XPath',
            valueLabel: 'XPath',
            valuePlaceholder: '/apigee:test/apigee:example',
            addLabel: 'Add XML variable',
            help: 'Only read when the Content-Type is text/xml, application/xml or application/*+xml.',
          },
        ],
      },
    ],
  },

  // Apigee X's narrower replacement for AssignMessage when all you are doing is
  // headers, query params, form params and the request line — same Add/Set/
  // Remove shape, minus the payload and variable assignment.
  HTTPModifier: {
    rootTag: 'HTTPModifier',
    sections: [
      {
        title: 'Assign To',
        fields: [
          {
            id: 'assignTo',
            type: 'element',
            label: 'Assign To',
            path: ['AssignTo'],
            hasText: true,
            textLabel: 'Variable name (blank = current message)',
            attrs: [
              { name: 'createNew', label: 'Create new message', kind: 'boolean', default: 'false' },
              { name: 'type', label: 'Type', kind: 'select', options: ['request', 'response'], default: 'request' },
              { name: 'transport', label: 'Transport', kind: 'text', default: 'http' },
            ],
          },
        ],
      },
      {
        title: 'Set',
        fields: [
          { id: 'setHeaders', type: 'kv-list', label: 'Set Headers', path: ['Set', 'Headers'], itemTag: 'Header', keyPlaceholder: 'Content-Type', valuePlaceholder: 'application/json' },
          { id: 'setQueryParams', type: 'kv-list', label: 'Set Query Params', path: ['Set', 'QueryParams'], itemTag: 'QueryParam' },
          { id: 'setFormParams', type: 'kv-list', label: 'Set Form Params', path: ['Set', 'FormParams'], itemTag: 'FormParam' },
          { id: 'setPath', type: 'text', label: 'Set Path', path: ['Set', 'Path'] },
          { id: 'setStatusCode', type: 'text', label: 'Set Status Code', path: ['Set', 'StatusCode'], placeholder: '200' },
          { id: 'setVerb', type: 'select', label: 'Set Verb', path: ['Set', 'Verb'], options: ['', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
          { id: 'setVersion', type: 'select', label: 'Set Version', path: ['Set', 'Version'], options: ['', '1.0', '1.1'] },
        ],
      },
      {
        title: 'Add',
        fields: [
          { id: 'addHeaders', type: 'kv-list', label: 'Add Headers', path: ['Add', 'Headers'], itemTag: 'Header' },
          { id: 'addQueryParams', type: 'kv-list', label: 'Add Query Params', path: ['Add', 'QueryParams'], itemTag: 'QueryParam' },
          { id: 'addFormParams', type: 'kv-list', label: 'Add Form Params', path: ['Add', 'FormParams'], itemTag: 'FormParam' },
        ],
      },
      {
        // An empty <Remove/> strips everything from the message, so these are
        // all by-name and the empty-container shorthand stays an XML-tab thing.
        title: 'Remove',
        fields: [
          { id: 'removeHeaders', type: 'string-list', label: 'Remove Headers (by name)', path: ['Remove', 'Headers'], itemTag: 'Header', asAttr: true, placeholder: 'X-Remove-Me' },
          { id: 'removeQueryParams', type: 'string-list', label: 'Remove Query Params (by name)', path: ['Remove', 'QueryParams'], itemTag: 'QueryParam', asAttr: true },
          { id: 'removeFormParams', type: 'string-list', label: 'Remove Form Params (by name)', path: ['Remove', 'FormParams'], itemTag: 'FormParam', asAttr: true },
        ],
      },
      {
        title: 'Options',
        fields: [
          { id: 'ignoreUnresolved', type: 'boolean', label: 'Ignore Unresolved Variables', path: ['IgnoreUnresolvedVariables'], default: 'false', omitIfDefault: true },
        ],
      },
    ],
  },

  KeyValueMapOperations: {
    rootTag: 'KeyValueMapOperations',
    rootAttrs: [{ name: 'mapIdentifier', label: 'Map Identifier', kind: 'text' }],
    sections: [
      {
        title: 'Scope',
        fields: [
          { id: 'scope', type: 'select', label: 'Scope', path: ['Scope'], required: true, default: 'environment', options: ['apiproxy', 'environment', 'organization'] },
          { id: 'mapName', type: 'ref', label: 'Map Name', path: ['MapName'], help: 'Picks the KVM at runtime. Takes precedence over the Map Identifier above.' },
          { id: 'expiry', type: 'number', label: 'Cache Expiry (seconds)', path: ['ExpiryTimeInSecs'], placeholder: '300', help: '-1 caches for the life of the message processor; 0 never caches.' },
        ],
      },
      {
        title: 'Get',
        fields: [
          { id: 'getAssignTo', type: 'attr', label: 'Assign To', path: ['Get'], attr: 'assignTo' },
          { id: 'getKey', type: 'text', label: 'Key', path: ['Get', 'Key', 'Parameter'] },
        ],
      },
      {
        title: 'Put',
        fields: [
          { id: 'putOverride', type: 'attr-boolean', label: 'Override existing', path: ['Put'], attr: 'override', default: 'true' },
          { id: 'putKey', type: 'text', label: 'Key', path: ['Put', 'Key', 'Parameter'] },
          { id: 'putValue', type: 'ref', label: 'Value', path: ['Put', 'Value'] },
        ],
      },
      {
        title: 'Delete',
        fields: [{ id: 'deleteKey', type: 'text', label: 'Key', path: ['Delete', 'Key', 'Parameter'] }],
      },
    ],
  },
};

/**
 * The visual schema for a policy type, hand-written if there is one and derived
 * from the reference catalogue otherwise. See derivedPolicySchema.ts for why
 * the fallback exists and what it refuses to guess at.
 */
export function getPolicySchema(type: string): PolicySchema | undefined {
  return POLICY_SCHEMAS[type] ?? deriveSchema(type);
}
