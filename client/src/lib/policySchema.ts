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
  keyPlaceholder?: string;
  valuePlaceholder?: string;
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
  | PFIpRules;

export interface PolicyFieldSection {
  title: string;
  fields: PolicyField[];
}

export interface PolicySchema {
  rootTag: string;
  rootAttrs?: RootAttrDef[];
  sections: PolicyFieldSection[];
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
        title: 'Copy',
        fields: [
          { id: 'copySource', type: 'attr-select', label: 'Copy From', path: ['Copy'], attr: 'source', options: ['request', 'response'] },
          { id: 'copyHeaders', type: 'string-list', label: 'Copy Headers (by name)', path: ['Copy', 'Headers'], itemTag: 'Header', asAttr: true },
          { id: 'copyPayload', type: 'boolean', label: 'Copy Payload', path: ['Copy', 'Payload'], default: 'false', omitIfDefault: true },
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
        fields: [{ id: 'apiKey', type: 'ref', label: 'API Key', path: ['APIKey'], required: true, default: 'request.queryparam.apikey', help: 'Variable holding the key sent by the client.' }],
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
        ],
      },
      {
        title: 'Claim Validation',
        fields: [
          { id: 'issuer', type: 'ref', label: 'Issuer', path: ['Issuer'] },
          { id: 'audience', type: 'text', label: 'Audience', path: ['Audience'] },
          { id: 'subject', type: 'ref', label: 'Subject', path: ['Subject'] },
          { id: 'ignoreExpiry', type: 'boolean', label: 'Ignore Expiry (testing only)', path: ['IgnoreExpiry'], default: 'false', omitIfDefault: true },
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
          { id: 'class', type: 'ref', label: 'Class', path: ['Class'], help: 'Pulls quota settings dynamically (e.g. from an API product). Mutually exclusive with Identifier.' },
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
          { id: 'allowOrigins', type: 'text', label: 'Allow Origins', path: ['AllowOrigins'], default: '*', placeholder: 'https://app.example.com,https://admin.example.com' },
          { id: 'allowOriginsRef', type: 'text', label: 'Allow Origins (variable)', path: ['AllowOriginsRef'], help: 'Alternative to a literal list above.' },
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
          { id: 'generateErrorResponse', type: 'boolean', label: 'Generate Error Response', path: ['GenerateErrorResponse'], default: 'true' },
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
          { id: 'headers', type: 'kv-list', label: 'Headers', path: ['FaultResponse', 'Set', 'Headers'], itemTag: 'Header' },
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
          { id: 'protocol', type: 'select', label: 'Protocol', path: ['Syslog', 'Protocol'], default: 'TCP', options: ['UDP', 'TCP'] },
          { id: 'formatMessage', type: 'boolean', label: 'Format Message', path: ['Syslog', 'FormatMessage'], default: 'true' },
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
        fields: [{ id: 'scope', type: 'select', label: 'Scope', path: ['Scope'], required: true, default: 'environment', options: ['apiproxy', 'environment', 'organization'] }],
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

export function getPolicySchema(type: string): PolicySchema | undefined {
  return POLICY_SCHEMAS[type];
}
