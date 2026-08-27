import { escapeXml, XML_HEADER } from './xml.js';

// Each policy type describes how it renders as default Apigee X policy XML
// when first attached. After creation the raw XML is fully user-editable,
// exactly like the real Apigee UI — `type` only drives the gallery/icon/help text.
export const POLICY_TYPES = [
  // ---------------------------------------------------------------- Mediation
  {
    key: 'AssignMessage',
    tier: 'extensible',
    label: 'Assign Message',
    category: 'Mediation',
    icon: 'edit-3',
    accent: '#6C8EFF',
    description: 'Construct or modify request/response messages — set headers, payload, status code.',
    // No <AssignTo>: with no message name it's a no-op, and omitting it means
    // the policy acts on whichever message the flow it's attached to is
    // handling. Add <AssignTo> only to target a *named* message.
    defaultXml: (name) => `${XML_HEADER}<AssignMessage continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Set>
        <Headers>
            <Header name="Content-Type">application/json</Header>
        </Headers>
    </Set>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</AssignMessage>`,
  },
  {
    key: 'CorsHeaders',
    tier: 'extensible',
    label: 'CORS Headers (AssignMessage)',
    category: 'Mediation',
    icon: 'globe',
    accent: '#6C8EFF',
    xmlTag: 'AssignMessage',
    description: 'Preset AssignMessage that adds permissive CORS response headers by hand.',
    defaultXml: (name) => `${XML_HEADER}<AssignMessage continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Add>
        <Headers>
            <Header name="Access-Control-Allow-Origin">*</Header>
            <Header name="Access-Control-Allow-Headers">origin, x-requested-with, accept, content-type, authorization</Header>
            <Header name="Access-Control-Allow-Methods">GET, PUT, POST, DELETE, OPTIONS</Header>
            <Header name="Access-Control-Max-Age">3628800</Header>
        </Headers>
    </Add>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</AssignMessage>`,
  },
  {
    key: 'RaiseFault',
    tier: 'standard',
    label: 'Raise Fault',
    category: 'Mediation',
    icon: 'alert-triangle',
    accent: '#F2555C',
    description: 'Short-circuit the flow and return a custom error response.',
    defaultXml: (name) => `${XML_HEADER}<RaiseFault continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <FaultResponse>
        <Set>
            <StatusCode>400</StatusCode>
            <ReasonPhrase>Bad Request</ReasonPhrase>
            <Payload contentType="application/json">{"error": "Bad Request"}</Payload>
        </Set>
    </FaultResponse>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</RaiseFault>`,
  },
  {
    key: 'ExtractVariables',
    tier: 'extensible',
    label: 'Extract Variables',
    category: 'Mediation',
    icon: 'crosshair',
    accent: '#6C8EFF',
    description: 'Pull values out of the URI, headers, query params or payload into variables.',
    defaultXml: (name) => `${XML_HEADER}<ExtractVariables continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <VariablePrefix>extracted</VariablePrefix>
    <URIPath>
        <Pattern>/{resource}</Pattern>
    </URIPath>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</ExtractVariables>`,
  },
  {
    key: 'OASValidation',
    tier: 'standard',
    label: 'OpenAPI Spec Validation',
    category: 'Mediation',
    icon: 'file-check-2',
    accent: '#6C8EFF',
    description: 'Validates the request (and optionally response) against a bundled OpenAPI spec resource — the same policy Apigee X uses natively.',
    defaultXml: (name) => `${XML_HEADER}<OASValidation continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <OASResource>oas://spec.yaml</OASResource>
</OASValidation>`,
    resource: (name) => ({
      path: `resources/oas/spec.yaml`,
      content: `# Paste or import an OpenAPI 3.x / Swagger 2.0 spec here — referenced by policy ${name}.\n`,
    }),
  },
  {
    key: 'ParsePayload',
    tier: 'extensible',
    label: 'Parse Payload',
    category: 'Mediation',
    icon: 'file-scan',
    accent: '#6C8EFF',
    description: 'Pre-parses a JSON/XML payload so later policies can read it without re-parsing.',
    defaultXml: (name) => `${XML_HEADER}<ParsePayload continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <ParseType>JSON</ParseType>
</ParsePayload>`,
  },
  {
    key: 'JSONToXML',
    tier: 'standard',
    label: 'JSON to XML',
    category: 'Mediation',
    icon: 'file-code-2',
    accent: '#6C8EFF',
    description: 'Converts a JSON payload to XML — e.g. when the target only speaks XML/SOAP.',
    defaultXml: (name) => `${XML_HEADER}<JSONToXML continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>response</Source>
    <OutputVariable>response</OutputVariable>
    <Options>
        <ObjectRootElementName>Root</ObjectRootElementName>
    </Options>
</JSONToXML>`,
  },
  {
    key: 'XMLToJSON',
    tier: 'standard',
    label: 'XML to JSON',
    category: 'Mediation',
    icon: 'file-json-2',
    accent: '#6C8EFF',
    description: 'Converts an XML payload to JSON — expose a legacy XML/SOAP backend as JSON.',
    defaultXml: (name) => `${XML_HEADER}<XMLToJSON continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>response</Source>
    <OutputVariable>response</OutputVariable>
    <Options>
        <RecognizeNumber>true</RecognizeNumber>
        <RecognizeBoolean>true</RecognizeBoolean>
        <RecognizeNull>true</RecognizeNull>
        <NullValue>NULL</NullValue>
        <AttributeBlockName>#attrs</AttributeBlockName>
        <AttributePrefix>@</AttributePrefix>
    </Options>
</XMLToJSON>`,
  },
  {
    key: 'AssertCondition',
    tier: 'standard',
    label: 'Assert Condition',
    category: 'Mediation',
    icon: 'check-circle',
    accent: '#6C8EFF',
    description: 'Pre-computes a boolean condition once, reusable by later conditions or fault checks.',
    defaultXml: (name) => `${XML_HEADER}<AssertCondition continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Condition>request.verb = "GET"</Condition>
    <AssertionResult>assertion.result</AssertionResult>
</AssertCondition>`,
  },
  {
    key: 'ReadPropertySet',
    tier: 'standard',
    label: 'Read Property Set',
    category: 'Mediation',
    icon: 'settings-2',
    accent: '#6C8EFF',
    description: 'Reads key/value pairs from a bundled .properties file into flow variables.',
    // <Read> is the policy's only child element: <Name> is the property set
    // (the resources/properties file's basename, no extension), <Key> the
    // entry within it. Both accept a `ref` attribute to resolve dynamically.
    defaultXml: (name) => `${XML_HEADER}<ReadPropertySet continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Read>
        <Name>config</Name>
        <Key>example.key</Key>
        <AssignTo>propset.example</AssignTo>
        <DefaultValue>example-value</DefaultValue>
    </Read>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</ReadPropertySet>`,
    resource: (name) => ({
      path: `resources/properties/config.properties`,
      content: `# Referenced by policy ${name}\nexample.key=example-value\n`,
    }),
  },
  {
    key: 'XSL',
    tier: 'extensible',
    label: 'XSL Transform',
    category: 'Mediation',
    icon: 'file-diff',
    accent: '#6C8EFF',
    description: 'Applies an XSLT stylesheet resource to transform an XML request or response.',
    defaultXml: (name) => `${XML_HEADER}<XSL continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <ResourceURL>xsl://${escapeXml(name)}.xsl</ResourceURL>
    <Source>response</Source>
    <OutputVariable>response</OutputVariable>
</XSL>`,
    resource: (name) => ({
      path: `resources/xsl/${name}.xsl`,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${name}.xsl -->\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n    <xsl:template match="@*|node()">\n        <xsl:copy>\n            <xsl:apply-templates select="@*|node()"/>\n        </xsl:copy>\n    </xsl:template>\n</xsl:stylesheet>\n`,
    }),
  },
  {
    key: 'GraphQL',
    tier: 'standard',
    label: 'GraphQL',
    category: 'Mediation',
    icon: 'network',
    accent: '#6C8EFF',
    description: 'Validates an incoming GraphQL query/mutation against a bundled schema resource.',
    defaultXml: (name) => `${XML_HEADER}<GraphQL continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <SchemaFile>graphql://${escapeXml(name)}.graphql</SchemaFile>
    <OperationType>query,mutation</OperationType>
</GraphQL>`,
    resource: (name) => ({
      path: `resources/graphql/${name}.graphql`,
      content: `# ${name}.graphql — referenced by policy ${name}\ntype Query {\n    example: String\n}\n`,
    }),
  },
  {
    // "MessageValidation" is the real Apigee policy type (validating a SOAP
    // message via a bundled WSDL, or JSON via a schema) — the key matches
    // the XML root tag, same convention every other policy here follows, so
    // a real bundle re-imported through bundleImporter.js's
    // extractRootTagName() still resolves back to this template.
    key: 'MessageValidation',
    tier: 'standard',
    label: 'SOAP Message Validation',
    category: 'Mediation',
    icon: 'file-check',
    accent: '#6C8EFF',
    description: 'Validates a SOAP request/response against a bundled WSDL resource.',
    defaultXml: (name) => `${XML_HEADER}<MessageValidation continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <SOAPMessage version="1.1"/>
    <ResourceURL>wsdl://${escapeXml(name)}.wsdl</ResourceURL>
</MessageValidation>`,
    resource: (name) => ({
      path: `resources/wsdl/${name}.wsdl`,
      content: `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${name}.wsdl — paste or import a real WSDL here -->\n<definitions xmlns="http://schemas.xmlsoap.org/wsdl/">\n</definitions>\n`,
    }),
  },

  // ------------------------------------------------------------------ Security
  {
    key: 'VerifyAPIKey',
    tier: 'extensible',
    label: 'Verify API Key',
    category: 'Security',
    icon: 'key',
    accent: '#FFB454',
    description: 'Require and validate an API key on incoming requests.',
    defaultXml: (name) => `${XML_HEADER}<VerifyAPIKey continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <APIKey ref="request.queryparam.apikey"/>
</VerifyAPIKey>`,
  },
  {
    key: 'OAuthV2',
    tier: 'extensible',
    label: 'OAuth v2.0',
    category: 'Security',
    icon: 'lock',
    accent: '#FFB454',
    description: 'Issue, verify or refresh OAuth 2.0 tokens (VerifyAccessToken, GenerateAccessToken, ...).',
    defaultXml: (name) => `${XML_HEADER}<OAuthV2 continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Operation>VerifyAccessToken</Operation>
</OAuthV2>`,
  },
  {
    key: 'VerifyJWT',
    tier: 'standard',
    label: 'Verify JWT',
    category: 'Security',
    icon: 'shield-check',
    accent: '#FFB454',
    description: 'Validates a signed JWT — signature, expiry, issuer and audience claims.',
    defaultXml: (name) => `${XML_HEADER}<VerifyJWT continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Algorithm>RS256</Algorithm>
    <Source>request.header.Authorization</Source>
    <PublicKey>
        <JWKS uri="https://example.com/.well-known/jwks.json"/>
    </PublicKey>
    <Issuer>https://example.com/</Issuer>
    <Audience>my-audience</Audience>
</VerifyJWT>`,
  },
  {
    key: 'GenerateJWT',
    tier: 'extensible',
    label: 'Generate JWT',
    category: 'Security',
    icon: 'file-signature',
    accent: '#FFB454',
    description: 'Creates and signs a new JWT, e.g. to mint a token for a downstream service.',
    defaultXml: (name) => `${XML_HEADER}<GenerateJWT continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Algorithm>RS256</Algorithm>
    <PrivateKey>
        <Value ref="private.privatekey"/>
    </PrivateKey>
    <Subject>{subject}</Subject>
    <Issuer>https://example.com/</Issuer>
    <ExpiresIn>1h</ExpiresIn>
</GenerateJWT>`,
  },
  {
    key: 'DecodeJWT',
    tier: 'standard',
    label: 'Decode JWT',
    category: 'Security',
    icon: 'file-search',
    accent: '#FFB454',
    description: 'Decodes a JWT payload without verifying its signature (verification already done upstream).',
    defaultXml: (name) => `${XML_HEADER}<DecodeJWT continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request.header.Authorization</Source>
</DecodeJWT>`,
  },
  {
    key: 'BasicAuthentication',
    tier: 'extensible',
    label: 'Basic Authentication',
    category: 'Security',
    icon: 'user-lock',
    accent: '#FFB454',
    description: 'Encodes or decodes HTTP Basic Authentication credentials.',
    defaultXml: (name) => `${XML_HEADER}<BasicAuthentication continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Operation>Decode</Operation>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <Source>request.header.Authorization</Source>
    <AssignTo createNew="false">request.header.Authorization</AssignTo>
</BasicAuthentication>`,
  },
  {
    key: 'CORS',
    tier: 'standard',
    label: 'CORS',
    category: 'Security',
    icon: 'globe-2',
    accent: '#FFB454',
    description: 'Native CORS policy — declaratively answers preflight requests and sets Access-Control-* headers.',
    defaultXml: (name) => `${XML_HEADER}<CORS continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <AllowOrigins>*</AllowOrigins>
    <AllowMethods>GET, POST, PUT, DELETE, OPTIONS</AllowMethods>
    <AllowHeaders>origin, x-requested-with, accept, content-type, authorization</AllowHeaders>
    <ExposeHeaders>*</ExposeHeaders>
    <MaxAge>3628800</MaxAge>
    <AllowCredentials>false</AllowCredentials>
    <GenerateErrorResponse>true</GenerateErrorResponse>
</CORS>`,
  },
  {
    key: 'HMAC',
    tier: 'standard',
    label: 'HMAC',
    category: 'Security',
    icon: 'fingerprint',
    accent: '#FFB454',
    description: 'Generates or verifies an HMAC signature using a shared secret.',
    // <Algorithm> is the bare digest name (SHA256), not "HmacSHA256".
    // <SecretKey> is a self-closing element carrying ref= (required — the
    // secret must come from a variable, never inline) plus an optional
    // encoding=. The result goes to <Output>, not <OutputVariable>. There is
    // no <Operation>: add a <VerificationValue> to verify instead of sign.
    defaultXml: (name) => `${XML_HEADER}<HMAC continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Algorithm>SHA256</Algorithm>
    <SecretKey encoding="base64" ref="private.secretkey"/>
    <Message>{request.uri}</Message>
    <Output encoding="base64">hmac.signature</Output>
</HMAC>`,
  },
  {
    key: 'AccessControl',
    tier: 'standard',
    label: 'Access Control',
    category: 'Security',
    icon: 'shield',
    accent: '#FFB454',
    description: 'Allow or deny requests by source IP address.',
    defaultXml: (name) => `${XML_HEADER}<AccessControl continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IPRules noRuleMatchAction="ALLOW">
        <MatchRule action="DENY">
            <SourceAddress mask="32">1.2.3.4</SourceAddress>
        </MatchRule>
    </IPRules>
</AccessControl>`,
  },
  {
    key: 'RegularExpressionProtection',
    tier: 'extensible',
    label: 'RegEx Protection',
    category: 'Security',
    icon: 'shield-alert',
    accent: '#FFB454',
    description: 'Block requests matching known injection/attack patterns.',
    defaultXml: (name) => `${XML_HEADER}<RegularExpressionProtection continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <URIPath>
        <Pattern>((.|\\n)*)((?i)delete\\s)((.|\\n)*)</Pattern>
    </URIPath>
</RegularExpressionProtection>`,
  },
  {
    key: 'JSONThreatProtection',
    tier: 'extensible',
    label: 'JSON Threat Protection',
    category: 'Security',
    icon: 'bug-off',
    accent: '#FFB454',
    description: 'Rejects malformed/oversized JSON — depth, entry count, string length limits.',
    defaultXml: (name) => `${XML_HEADER}<JSONThreatProtection continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <ArrayElementCount>20</ArrayElementCount>
    <ContainerDepth>10</ContainerDepth>
    <ObjectEntryCount>15</ObjectEntryCount>
    <ObjectEntryNameLength>100</ObjectEntryNameLength>
    <StringValueLength>500</StringValueLength>
</JSONThreatProtection>`,
  },
  {
    key: 'XMLThreatProtection',
    tier: 'extensible',
    label: 'XML Threat Protection',
    category: 'Security',
    icon: 'bug-off',
    accent: '#FFB454',
    description: 'Rejects malformed/oversized XML — node depth, attribute count, text length limits.',
    defaultXml: (name) => `${XML_HEADER}<XMLThreatProtection continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request</Source>
    <StructureLimits>
        <NodeDepth limit="10"/>
        <AttributeCountPerElement limit="10"/>
        <NamespaceCountPerElement limit="10"/>
        <ChildCount limit="50" includeComment="true" includeElement="true" includeProcessingInstruction="true" includeText="true"/>
    </StructureLimits>
    <ValueLimits>
        <Text minLength="0" maxLength="10000"/>
        <Attribute minLength="0" maxLength="500"/>
        <NamespaceURI minLength="0" maxLength="500"/>
        <Comment minLength="0" maxLength="500"/>
        <ProcessingInstructionData minLength="0" maxLength="500"/>
        <ProcessingInstructionTarget minLength="0" maxLength="500"/>
    </ValueLimits>
</XMLThreatProtection>`,
  },

  // ----------------------------------------------------------------- Extension
  {
    key: 'ServiceCallout',
    tier: 'extensible',
    label: 'Service Callout',
    category: 'Extension',
    icon: 'phone-outgoing',
    accent: '#8B6CFF',
    description: 'Call another HTTP service mid-flow and capture the response into a variable.',
    defaultXml: (name) => `${XML_HEADER}<ServiceCallout continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Request clearPayload="true" variable="${escapeXml(name)}.request">
        <Set>
            <Verb>GET</Verb>
        </Set>
    </Request>
    <Response>${escapeXml(name)}.response</Response>
    <HTTPTargetConnection>
        <URL>https://example.com/api</URL>
    </HTTPTargetConnection>
</ServiceCallout>`,
  },
  {
    key: 'FlowCallout',
    tier: 'extensible',
    label: 'Flow Callout',
    category: 'Extension',
    icon: 'git-branch',
    accent: '#8B6CFF',
    description: 'Invoke a reusable shared flow.',
    defaultXml: (name) => `${XML_HEADER}<FlowCallout continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <SharedFlowBundle>shared-flow-name</SharedFlowBundle>
</FlowCallout>`,
  },
  {
    key: 'Javascript',
    tier: 'extensible',
    label: 'JavaScript',
    category: 'Extension',
    icon: 'code',
    accent: '#8B6CFF',
    description: 'Run custom JavaScript logic against the message context.',
    defaultXml: (name) => `${XML_HEADER}<Javascript continueOnError="false" enabled="true" timeLimit="200" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <ResourceURL>jsc://${escapeXml(name)}.js</ResourceURL>
</Javascript>`,
    resource: (name) => ({
      path: `resources/jsc/${name}.js`,
      content: `// ${name}.js\n// Available context: context, request, response, properties\ncontext.setVariable('example.executed', true);\n`,
    }),
  },
  {
    key: 'PythonScript',
    tier: 'extensible',
    label: 'Python Script',
    category: 'Extension',
    icon: 'terminal',
    accent: '#8B6CFF',
    description: 'Run custom Python (Jython) logic inline in the flow.',
    defaultXml: (name) => `${XML_HEADER}<PythonScript continueOnError="false" enabled="true" timeLimit="200" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <ResourceURL>py://${escapeXml(name)}.py</ResourceURL>
</PythonScript>`,
    resource: (name) => ({
      path: `resources/py/${name}.py`,
      content: `# ${name}.py\n# Available: flow, request, response, context\ncontext.setVariable("example.executed", True)\n`,
    }),
  },
  {
    key: 'JavaCallout',
    tier: 'extensible',
    label: 'Java Callout',
    category: 'Extension',
    icon: 'coffee',
    accent: '#8B6CFF',
    description: 'Executes custom Java code packaged as a JAR — for complex or performance-sensitive logic.',
    defaultXml: (name) => `${XML_HEADER}<JavaCallout continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <ClassName>com.example.MyCallout</ClassName>
    <ResourceURL>java://${escapeXml(name)}.jar</ResourceURL>
</JavaCallout>`,
    // No auto-generated resource: a real compiled .jar can't be stubbed as text.
    // Add the compiled jar to apiproxy/resources/java/ yourself before importing.
  },

  // ---------------------------------------------------------- Traffic Management
  {
    key: 'SpikeArrest',
    tier: 'standard',
    label: 'Spike Arrest',
    category: 'Traffic Management',
    icon: 'activity',
    accent: '#26C6A6',
    description: 'Smooth traffic spikes by capping the request rate evenly over time.',
    defaultXml: (name) => `${XML_HEADER}<SpikeArrest continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Identifier ref="request.header.some-header-name"/>
    <MessageWeight ref="request.header.weight"/>
    <Rate>30ps</Rate>
</SpikeArrest>`,
  },
  {
    key: 'Quota',
    tier: 'extensible',
    label: 'Quota',
    category: 'Traffic Management',
    icon: 'bar-chart-2',
    accent: '#26C6A6',
    description: 'Enforce a rolling or calendar-based request quota per app/developer.',
    // type="calendar" REQUIRES <StartTime> — the counter is refreshed relative
    // to it, and Apigee rejects the policy without one. <Distributed>true is
    // the right default on Apigee X (all runtime pods share one counter);
    // leaving it off makes each pod count independently.
    defaultXml: (name) => `${XML_HEADER}<Quota continueOnError="false" enabled="true" name="${escapeXml(name)}" type="calendar">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Allow count="1000"/>
    <Interval>1</Interval>
    <TimeUnit>month</TimeUnit>
    <StartTime>2026-01-01 00:00:00</StartTime>
    <Distributed>true</Distributed>
    <Synchronous>false</Synchronous>
</Quota>`,
  },
  {
    key: 'ResetQuota',
    tier: 'extensible',
    label: 'Reset Quota',
    category: 'Traffic Management',
    icon: 'rotate-ccw',
    accent: '#26C6A6',
    description: "Programmatically resets or adjusts a named Quota policy's counter.",
    defaultXml: (name) => `${XML_HEADER}<ResetQuota continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Quota name="Q-MonthlyQuota">
        <Identifier ref="request.header.quota-identifier"/>
        <Allow>
            <Class ref="verifyapikey.VA-VerifyApiKey.apiproduct.developer.quota.limit"/>
        </Allow>
    </Quota>
</ResetQuota>`,
  },

  // ------------------------------------------------------------------- Caching
  {
    key: 'ResponseCache',
    tier: 'extensible',
    label: 'Response Cache',
    category: 'Caching',
    icon: 'database',
    accent: '#37B6E0',
    description: 'Cache entire HTTP responses keyed by request signature to reduce backend load.',
    // ExcludeErrorResponse defaults to false, which caches 4xx/5xx responses
    // and serves them for the whole TTL — a well-known Apigee antipattern, so
    // it's on by default here. TimeoutInSec is deprecated in favour of
    // TimeoutInSeconds.
    defaultXml: (name) => `${XML_HEADER}<ResponseCache continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CacheKey>
        <KeyFragment ref="request.uri"/>
    </CacheKey>
    <ExpirySettings>
        <TimeoutInSeconds>300</TimeoutInSeconds>
    </ExpirySettings>
    <ExcludeErrorResponse>true</ExcludeErrorResponse>
    <Scope>Exclusive</Scope>
</ResponseCache>`,
  },
  {
    key: 'PopulateCache',
    tier: 'extensible',
    label: 'Populate Cache',
    category: 'Caching',
    icon: 'save',
    accent: '#37B6E0',
    description: 'Writes a value into a named cache with a key and TTL, for later LookupCache reads.',
    defaultXml: (name) => `${XML_HEADER}<PopulateCache continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CacheResource>default</CacheResource>
    <Scope>Exclusive</Scope>
    <ExpirySettings>
        <TimeoutInSeconds>300</TimeoutInSeconds>
    </ExpirySettings>
    <CacheKey>
        <KeyFragment ref="request.uri"/>
    </CacheKey>
    <Source>response.content</Source>
</PopulateCache>`,
  },
  {
    key: 'LookupCache',
    tier: 'extensible',
    label: 'Lookup Cache',
    category: 'Caching',
    icon: 'search',
    accent: '#37B6E0',
    description: 'Reads a value from a named cache by key — skip expensive work on a cache hit.',
    defaultXml: (name) => `${XML_HEADER}<LookupCache continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CacheResource>default</CacheResource>
    <Scope>Exclusive</Scope>
    <CacheKey>
        <KeyFragment ref="request.uri"/>
    </CacheKey>
    <AssignTo>cached.response</AssignTo>
</LookupCache>`,
  },
  {
    key: 'InvalidateCache',
    tier: 'extensible',
    label: 'Invalidate Cache',
    category: 'Caching',
    icon: 'trash',
    accent: '#37B6E0',
    description: 'Removes a specific entry (or key prefix) from a cache to force-refresh stale data.',
    defaultXml: (name) => `${XML_HEADER}<InvalidateCache continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CacheResource>default</CacheResource>
    <Scope>Exclusive</Scope>
    <CacheKey>
        <KeyFragment ref="request.uri"/>
    </CacheKey>
</InvalidateCache>`,
  },

  // ------------------------------------------------------------ Storage & Config
  {
    key: 'KeyValueMapOperations',
    tier: 'extensible',
    label: 'Key Value Map Ops',
    category: 'Storage & Config',
    icon: 'layers',
    accent: '#B98CFF',
    description: 'Read/write values from a persistent Key Value Map.',
    defaultXml: (name) => `${XML_HEADER}<KeyValueMapOperations continueOnError="false" enabled="true" mapIdentifier="kvm-${escapeXml(name)}" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Scope>environment</Scope>
    <Get assignTo="private.value">
        <Key>
            <Parameter>my-key</Parameter>
        </Key>
    </Get>
</KeyValueMapOperations>`,
  },

  // ------------------------------------------------------- Logging & Observability
  {
    key: 'MessageLogging',
    tier: 'extensible',
    label: 'Message Logging (Cloud Logging)',
    category: 'Logging & Observability',
    icon: 'file-text',
    accent: '#8FA0B8',
    description: 'Logs a custom message to Google Cloud Logging — the native sink on Apigee X.',
    // <CloudLogging> and <Syslog> are mutually exclusive in one policy — see
    // the MessageLoggingSyslog entry below for the external-syslog variant.
    // Attach this in the ProxyEndpoint's PostClientFlow so logging happens
    // after the response is already on the wire.
    defaultXml: (name) => `${XML_HEADER}<MessageLogging continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CloudLogging>
        <LogName>projects/{organization.name}/logs/apigee-proxy-log</LogName>
        <Message contentType="application/json">{"proxy":"{apiproxy.name}","verb":"{request.verb}","uri":"{request.uri}","status":"{response.status.code}"}</Message>
    </CloudLogging>
</MessageLogging>`,
  },
  {
    key: 'MessageLoggingSyslog',
    tier: 'extensible',
    label: 'Message Logging (Syslog)',
    category: 'Logging & Observability',
    icon: 'file-text',
    accent: '#8FA0B8',
    xmlTag: 'MessageLogging',
    description: 'Sends a custom-formatted log message to an external Syslog sink instead of Cloud Logging.',
    defaultXml: (name) => `${XML_HEADER}<MessageLogging continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Syslog>
        <Message>{apiproxy.name} {request.verb} {request.uri} status={response.status.code}</Message>
        <Host>syslog.example.com</Host>
        <Port>514</Port>
        <Protocol>TCP</Protocol>
        <FormatMessage>true</FormatMessage>
    </Syslog>
</MessageLogging>`,
  },
  {
    key: 'DataCapture',
    tier: 'extensible',
    label: 'Data Capture',
    category: 'Logging & Observability',
    icon: 'clipboard-list',
    accent: '#8FA0B8',
    description: 'Captures values from a message into a named data collector for Apigee Analytics.',
    // <Capture> requires BOTH <DataCollector> and <Collect>; there is no
    // <Source>/<VariablePrefix>/<Variable> here (those belong to
    // ExtractVariables). The data collector must already exist in the org —
    // create it first, then point <DataCollector> at its name. Use one
    // <Capture> block per collector; two blocks may not share a collector.
    defaultXml: (name) => `${XML_HEADER}<DataCapture continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Capture>
        <DataCollector>dc_data_collector</DataCollector>
        <Collect ref="message.content" default=""/>
    </Capture>
</DataCapture>`,
  },
  {
    key: 'TraceCapture',
    tier: 'extensible',
    label: 'Trace Capture',
    category: 'Logging & Observability',
    icon: 'bug',
    accent: '#8FA0B8',
    description: 'Preview (pre-GA). Adds custom variables to distributed-tracing spans — requires distributed tracing enabled on the runtime.',
    // Child elements are <Variables>/<Variable name ref>, plus
    // <IgnoreUnresolvedVariables> and <ThrowExceptionOnLimit>. The captured
    // values surface in the TraceCaptureExecution span, not in Analytics —
    // that's DataCapture's job.
    defaultXml: (name) => `${XML_HEADER}<TraceCapture continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Variables>
        <Variable name="request-uri" ref="request.uri">none</Variable>
    </Variables>
    <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
    <ThrowExceptionOnLimit>false</ThrowExceptionOnLimit>
</TraceCapture>`,
  },

  // ------------------------------------------------------------------- AI / LLM
  {
    key: 'LLMTokenQuota',
    tier: 'extensible',
    label: 'LLM Token Quota',
    category: 'AI / LLM',
    icon: 'brain-circuit',
    accent: '#FF8BD1',
    description: 'Enforces a quota measured in LLM tokens (not requests). Apigee only — not supported on Apigee hybrid.',
    // Token counts come from <LLMTokenUsageSource> and the model name from
    // <LLMModelSource> — both message templates over the LLM response. For a
    // split enforce/count setup, pair two policies sharing a <SharedName>:
    // one with <EnforceOnly>true in the request flow, one with <CountOnly>true
    // in the response flow (or an <EventFlow> for streaming/SSE targets).
    defaultXml: (name) => `${XML_HEADER}<LLMTokenQuota continueOnError="false" enabled="true" name="${escapeXml(name)}" type="rollingwindow">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Allow count="100000"/>
    <Interval>1</Interval>
    <TimeUnit>day</TimeUnit>
    <Distributed>true</Distributed>
    <LLMTokenUsageSource>{jsonPath('$.usageMetadata.candidatesTokenCount',response.content,true)}</LLMTokenUsageSource>
    <LLMModelSource>{jsonPath('$.model',response.content,true)}</LLMModelSource>
</LLMTokenQuota>`,
  },
  {
    key: 'PromptTokenLimit',
    tier: 'extensible',
    label: 'Prompt Token Limit',
    category: 'AI / LLM',
    icon: 'activity',
    accent: '#FF8BD1',
    // This is a RATE limiter, not a per-request size cap — it's SpikeArrest for
    // prompt tokens. <Rate> is required and uses the same intps/intpm notation
    // as SpikeArrest. To cap a single prompt's size instead, use LLMTokenQuota
    // or an ExtractVariables + RaiseFault pair. Apigee only, not hybrid.
    description: 'Throttles the rate of prompt tokens (SpikeArrest-style) to shield an LLM backend from bursts.',
    defaultXml: (name) => `${XML_HEADER}<PromptTokenLimit continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
    <Identifier ref="request.header.x-api-key"/>
    <Rate>1000pm</Rate>
    <UseEffectiveCount>false</UseEffectiveCount>
</PromptTokenLimit>`,
  },
  {
    key: 'SanitizeUserPrompt',
    tier: 'extensible',
    label: 'Sanitize User Prompt',
    category: 'AI / LLM',
    icon: 'shield-half',
    accent: '#FF8BD1',
    description: "Screens the user's prompt via Model Armor before it reaches the LLM — requires a Model Armor template.",
    // Screening is delegated to Model Armor: <ModelArmor><TemplateName> is
    // required and must point at an existing template (create it in Model Armor
    // first, and grant the proxy's service account roles/modelarmor.user).
    // There is no <Source>/<FailOnDetection> — what to block is configured on
    // the template, and prompt extraction on <UserPromptSource>.
    defaultXml: (name) => `${XML_HEADER}<SanitizeUserPrompt continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <ModelArmor>
        <TemplateName>projects/{organization.name}/locations/{system.region.name}/templates/my-template</TemplateName>
    </ModelArmor>
    <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
</SanitizeUserPrompt>`,
  },
  {
    key: 'SanitizeModelResponse',
    tier: 'extensible',
    label: 'Sanitize Model Response',
    category: 'AI / LLM',
    icon: 'shield-half',
    accent: '#FF8BD1',
    description: "Screens the LLM's output via Model Armor before it's returned to the caller — pairs with Sanitize User Prompt.",
    // Same Model Armor contract as SanitizeUserPrompt, plus
    // <LLMResponseSource> for pulling the model's output out of the response.
    defaultXml: (name) => `${XML_HEADER}<SanitizeModelResponse continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <ModelArmor>
        <TemplateName>projects/{organization.name}/locations/{system.region.name}/templates/my-template</TemplateName>
    </ModelArmor>
    <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
    <LLMResponseSource>{jsonPath('$.candidates[-1].content.parts',response.content,true)}</LLMResponseSource>
</SanitizeModelResponse>`,
  },
  {
    key: 'SemanticCacheLookup',
    tier: 'extensible',
    label: 'Semantic Cache Lookup',
    category: 'AI / LLM',
    icon: 'sparkles',
    accent: '#FF8BD1',
    description: 'Checks whether a semantically similar prompt was answered recently — backed by Vertex AI embeddings + Vector Search.',
    // Not an Apigee cache: <Embeddings> calls the Vertex AI Text embeddings
    // API and <SimilaritySearch> queries a deployed Vector Search index
    // endpoint (:findNeighbors). Both are required, and both need a real
    // Vertex AI project, index and deployed index endpoint — there is no
    // <CacheResource>. Replace the {PLACEHOLDER} segments before deploying.
    defaultXml: (name) => `${XML_HEADER}<SemanticCacheLookup continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
    <UserPromptSource>{jsonPath('$.contents[-1].parts[-1].text',request.content,true)}</UserPromptSource>
    <Embeddings>
        <VertexAI>
            <URL>https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/text-embedding-005:predict</URL>
        </VertexAI>
    </Embeddings>
    <SimilaritySearch>
        <VertexAI>
            <URL>https://{PUBLIC_DOMAIN_NAME}/v1/projects/{PROJECT_ID}/locations/{LOCATION}/indexEndpoints/{INDEX_ENDPOINT_ID}:findNeighbors</URL>
            <DeployedIndexID>{DEPLOYED_INDEX_ID}</DeployedIndexID>
            <Threshold>0.95</Threshold>
        </VertexAI>
    </SimilaritySearch>
</SemanticCacheLookup>`,
  },
  {
    key: 'SemanticCachePopulate',
    tier: 'extensible',
    label: 'Semantic Cache Populate',
    category: 'AI / LLM',
    icon: 'sparkles',
    accent: '#FF8BD1',
    description: 'Upserts a new prompt/response pair into the Vector Search index for future similarity hits.',
    // Writes back via :upsertDatapoints on the INDEX (not the index endpoint
    // that Lookup queries — different URL shape). TTL is <TTLInSeconds>, a
    // flat element; there is no <ExpirySettings> wrapper here.
    defaultXml: (name) => `${XML_HEADER}<SemanticCachePopulate continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <SimilaritySearch>
        <VertexAI>
            <URL>https://{LOCATION}-aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/indexes/{INDEX_ID}:upsertDatapoints</URL>
        </VertexAI>
    </SimilaritySearch>
    <TTLInSeconds>3600</TTLInSeconds>
</SemanticCachePopulate>`,
  },

  // ------------------------------------------------- Google Cloud integration
  {
    key: 'HTTPModifier',
    tier: 'standard',
    label: 'HTTP Modifier',
    category: 'Mediation',
    icon: 'replace',
    accent: '#6C8EFF',
    description: 'Adds, sets or removes headers, query params and form params — the Standard-tier subset of Assign Message.',
    // Prefer this over AssignMessage whenever you only need to move headers or
    // params around: AssignMessage is an Extensible policy, and one Extensible
    // policy re-tiers billing for EVERY call to the proxy. Order matters — the
    // Add/Set/Remove blocks execute in the order they appear.
    defaultXml: (name) => `${XML_HEADER}<HTTPModifier continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Add>
        <Headers>
            <Header name="X-Added-Header">value</Header>
        </Headers>
    </Add>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <AssignTo createNew="false" transport="http" type="request"/>
</HTTPModifier>`,
  },
  {
    key: 'ExternalCallout',
    tier: 'standard',
    label: 'External Callout (gRPC)',
    category: 'Extension',
    icon: 'radio',
    accent: '#8B6CFF',
    description: 'Calls an external gRPC service mid-flow via a named Target Server — Standard-tier alternative to Service Callout.',
    defaultXml: (name) => `${XML_HEADER}<ExternalCallout continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <TimeoutMs>5000</TimeoutMs>
    <GrpcConnection>
        <Server name="external-target-server"/>
    </GrpcConnection>
    <Configurations>
        <Property name="with.request.content">true</Property>
        <Property name="with.request.headers">false</Property>
        <Property name="with.response.content">true</Property>
        <Property name="with.response.headers">false</Property>
    </Configurations>
</ExternalCallout>`,
  },
  {
    key: 'PublishMessage',
    tier: 'standard',
    label: 'Publish Message (Pub/Sub)',
    category: 'Logging & Observability',
    icon: 'send',
    accent: '#8FA0B8',
    description: 'Publishes a message to a Cloud Pub/Sub topic — fire-and-forget event emission from a flow.',
    defaultXml: (name) => `${XML_HEADER}<PublishMessage continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>{"proxy":"{apiproxy.name}","verb":"{request.verb}","uri":"{request.uri}"}</Source>
    <CloudPubSub>
        <Topic>projects/{organization.name}/topics/my-topic</Topic>
    </CloudPubSub>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</PublishMessage>`,
  },
  {
    key: 'VerifyIAM',
    tier: 'standard',
    label: 'Verify IAM',
    category: 'Security',
    icon: 'badge-check',
    accent: '#FFB454',
    description: 'Authenticates the caller against Google Cloud IAM using a Google-issued token.',
    defaultXml: (name) => `${XML_HEADER}<VerifyIAM continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <CredentialSource>request.header.authorization</CredentialSource>
</VerifyIAM>`,
  },
  {
    key: 'IntegrationCallout',
    tier: 'extensible',
    label: 'Integration Callout',
    category: 'Extension',
    icon: 'workflow',
    accent: '#8B6CFF',
    description: 'Runs an Application Integration integration — pair with Set Integration Request, which builds its input.',
    defaultXml: (name) => `${XML_HEADER}<IntegrationCallout continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <AsyncExecution>false</AsyncExecution>
    <Request clearPayload="true">my_request_flow_var</Request>
    <Response>my_response_flow_var</Response>
</IntegrationCallout>`,
  },
  {
    key: 'SetIntegrationRequest',
    tier: 'extensible',
    label: 'Set Integration Request',
    category: 'Extension',
    icon: 'file-input',
    accent: '#8B6CFF',
    description: 'Builds the request variable an Integration Callout consumes — names the integration, region and API trigger.',
    defaultXml: (name) => `${XML_HEADER}<SetIntegrationRequest continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <ProjectId>my-gcp-project</ProjectId>
    <IntegrationName>my-integration</IntegrationName>
    <IntegrationRegion>us-central1</IntegrationRegion>
    <ApiTrigger>my-api-trigger</ApiTrigger>
    <Request>my_request_flow_var</Request>
</SetIntegrationRequest>`,
  },
  {
    key: 'AccessEntity',
    tier: 'extensible',
    label: 'Access Entity',
    category: 'Storage & Config',
    icon: 'user-search',
    accent: '#B98CFF',
    description: 'Reads a developer, app, API product or company profile out of the Apigee datastore into a variable.',
    defaultXml: (name) => `${XML_HEADER}<AccessEntity continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <EntityType value="developer"/>
    <EntityIdentifier ref="request.queryparam.apikey" type="consumerkey"/>
</AccessEntity>`,
  },
  {
    key: 'MonetizationLimitsCheck',
    tier: 'extensible',
    label: 'Monetization Limits Check',
    category: 'Traffic Management',
    icon: 'receipt',
    accent: '#26C6A6',
    description: 'Blocks the call when the developer has exceeded their monetization limits or been suspended.',
    defaultXml: (name) => `${XML_HEADER}<MonetizationLimitsCheck continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
    <FaultResponse>
        <Set>
            <Payload contentType="application/json">{"error":"Usage limit exceeded or developer suspended"}</Payload>
            <StatusCode>403</StatusCode>
        </Set>
    </FaultResponse>
</MonetizationLimitsCheck>`,
  },

  // ---------------------------------------------------------------- JWS
  // JWS signs/verifies an arbitrary payload; JWT is the JSON-claims-shaped
  // special case. Reach for JWS when the content isn't a claims set — for
  // example a detached signature over a request body.
  {
    key: 'VerifyJWS',
    tier: 'extensible',
    label: 'Verify JWS',
    category: 'Security',
    icon: 'shield-check',
    accent: '#FFB454',
    description: 'Verifies a JWS signature over a payload (optionally detached content).',
    defaultXml: (name) => `${XML_HEADER}<VerifyJWS continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Algorithm>RS256</Algorithm>
    <Source>request.header.jws</Source>
    <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
    <PublicKey>
        <JWKS uri="https://example.com/.well-known/jwks.json"/>
    </PublicKey>
</VerifyJWS>`,
  },
  {
    key: 'GenerateJWS',
    tier: 'extensible',
    label: 'Generate JWS',
    category: 'Security',
    icon: 'file-signature',
    accent: '#FFB454',
    description: 'Signs a payload as a JWS and writes the result to a variable.',
    defaultXml: (name) => `${XML_HEADER}<GenerateJWS continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Algorithm>RS256</Algorithm>
    <IgnoreUnresolvedVariables>false</IgnoreUnresolvedVariables>
    <PrivateKey>
        <Value ref="private.privatekey"/>
    </PrivateKey>
    <Payload ref="my-payload"/>
    <OutputVariable>jws.generated</OutputVariable>
</GenerateJWS>`,
  },
  {
    key: 'DecodeJWS',
    tier: 'extensible',
    label: 'Decode JWS',
    category: 'Security',
    icon: 'file-search',
    accent: '#FFB454',
    description: 'Decodes a JWS header without verifying its signature (verification already done upstream).',
    defaultXml: (name) => `${XML_HEADER}<DecodeJWS continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <Source>request.header.jws</Source>
</DecodeJWS>`,
  },

  // ------------------------------------------------------- OAuth token admin
  {
    key: 'GetOAuthV2Info',
    tier: 'extensible',
    label: 'Get OAuth v2 Info',
    category: 'Security',
    icon: 'info',
    accent: '#FFB454',
    description: 'Reads the profile of an existing access token, auth code, refresh token or client — into flow variables.',
    defaultXml: (name) => `${XML_HEADER}<GetOAuthV2Info continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <AccessToken ref="request.queryparam.access_token"/>
</GetOAuthV2Info>`,
  },
  {
    key: 'SetOAuthV2Info',
    tier: 'extensible',
    label: 'Set OAuth v2 Info',
    category: 'Security',
    icon: 'file-pen',
    accent: '#FFB454',
    description: 'Attaches custom attributes to an existing OAuth 2.0 access token.',
    defaultXml: (name) => `${XML_HEADER}<SetOAuthV2Info continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <AccessToken ref="request.queryparam.access_token"/>
    <Attributes>
        <Attribute name="department.id" ref="request.queryparam.department_id"/>
    </Attributes>
</SetOAuthV2Info>`,
  },
  {
    key: 'DeleteOAuthV2Info',
    tier: 'extensible',
    label: 'Delete OAuth v2 Info',
    category: 'Security',
    icon: 'trash-2',
    accent: '#FFB454',
    description: 'Revokes an OAuth 2.0 access token or authorization code.',
    defaultXml: (name) => `${XML_HEADER}<DeleteOAuthV2Info continueOnError="false" enabled="true" name="${escapeXml(name)}">
    <DisplayName>${escapeXml(name)}</DisplayName>
    <AccessToken ref="request.header.access_token"/>
</DeleteOAuthV2Info>`,
  },
];

export function getPolicyType(key) {
  return POLICY_TYPES.find((p) => p.key === key);
}
