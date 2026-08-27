import { getPolicyType } from '../lib/policyTemplates.js';
import { buildFlowCondition } from '../lib/model.js';

function policy(name, typeKey) {
  const type = getPolicyType(typeKey);
  return { id: name, name, type: typeKey, xml: type.defaultXml(name) };
}

// For policies that need hand-written XML instead of a type's generic default
// (e.g. an AssignMessage that sets a variable rather than headers, or a
// FlowCallout pointed at a specific named shared flow).
function customPolicy(name, typeKey, xml) {
  return { id: name, name, type: typeKey, xml };
}

// Same as customPolicy, but also bundles a resource file (JS/XSL/etc.) —
// for policies whose logic lives in apiproxy/resources rather than the XML.
function customPolicyWithResource(name, typeKey, xml, resourcePath, resourceContent) {
  return { id: name, name, type: typeKey, xml, resource: { path: resourcePath, content: resourceContent } };
}

function flowCalloutXml(name, sharedFlowName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<FlowCallout continueOnError="false" enabled="true" name="${name}">
    <DisplayName>${name}</DisplayName>
    <SharedFlowBundle>${sharedFlowName}</SharedFlowBundle>
</FlowCallout>`;
}

function assignVariableXml(name, variableName, value) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="${name}">
    <DisplayName>${name}</DisplayName>
    <AssignVariable>
        <Name>${variableName}</Name>
        <Value>${value}</Value>
    </AssignVariable>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</AssignMessage>`;
}

function target(name, url, description) {
  return {
    id: name,
    name,
    description: description || 'Default Target Endpoint',
    mode: 'url',
    url: { mode: 'literal', value: url },
    targetServers: [],
    preFlow: { request: [], response: [] },
    postFlow: { request: [], response: [] },
    flows: [],
    faultRules: { steps: [] },
    // Every built-in template targets https, and apigeelint's TD012 wants
    // exactly one <SSLInfo> there — matches createBlankProxy's default.
    sslInfo: { enabled: true },
  };
}

// A Target Server-backed target whose Path is a flow variable, resolved at
// runtime — e.g. each conditional flow assigns that variable to a different
// backend path before routing.
function targetWithVariablePath(name, targetServers, pathVariable, description) {
  return {
    id: name,
    name,
    description: description || 'Target Endpoint routed via Target Server',
    mode: 'targetServer',
    url: { mode: 'literal', value: '' },
    targetServers,
    path: { mode: 'variable', value: pathVariable },
    preFlow: { request: [], response: [] },
    postFlow: { request: [], response: [] },
    flows: [],
    faultRules: { steps: [] },
    sslInfo: { enabled: true },
  };
}

function simpleFlow({ id, name, description, pathValue, verb, steps }) {
  const condition = buildFlowCondition('MatchesPath', pathValue, verb);
  return {
    id,
    name,
    description,
    conditionMode: 'simple',
    pathValue: pathValue || '',
    pathOperator: 'MatchesPath',
    verb: verb || 'ANY',
    condition,
    request: steps.map((policyName) => ({ policyName })),
    response: [],
  };
}

export const BUILT_IN_TEMPLATES = [
  {
    id: 'tpl-blank',
    builtIn: true,
    name: 'Blank Pass-Through',
    description: 'The bare minimum: one target, no policies. A clean slate to build from.',
    tags: ['starter'],
    proxy: {
      name: 'blank-proxy',
      basePath: '/blank',
      description: 'A minimal pass-through proxy.',
      proxyEndpointName: 'default',
      policies: [],
      targets: [target('default', 'https://mocktarget.apigee.net')],
      preFlow: { request: [], response: [] },
      postFlow: { request: [], response: [] },
      flows: [],
      routeRules: [{ id: 'rr-default', name: 'default', targetName: 'default', condition: '' }],
      faultRules: { steps: [] },
    },
  },
  {
    id: 'tpl-secured-rest',
    builtIn: true,
    name: 'Secured REST API',
    description: 'API-key auth, spike protection, a monthly quota, CORS headers, and a health-check flow — the shape of most production proxies.',
    tags: ['security', 'traffic management'],
    proxy: {
      name: 'secured-api',
      basePath: '/secured-api',
      description: 'REST API secured with an API key, spike arrest and quota.',
      proxyEndpointName: 'default',
      policies: [
        policy('VA-VerifyApiKey', 'VerifyAPIKey'),
        policy('SA-SpikeArrest', 'SpikeArrest'),
        policy('Q-MonthlyQuota', 'Quota'),
        policy('AM-CorsHeaders', 'CorsHeaders'),
        policy('AM-HealthCheckResponse', 'AssignMessage'),
      ],
      targets: [target('default', 'https://mocktarget.apigee.net')],
      preFlow: {
        request: [
          { policyName: 'SA-SpikeArrest' },
          { policyName: 'VA-VerifyApiKey' },
          { policyName: 'Q-MonthlyQuota' },
        ],
        response: [{ policyName: 'AM-CorsHeaders' }],
      },
      postFlow: { request: [], response: [] },
      flows: [
        {
          id: 'flow-health',
          name: 'Health Check',
          description: 'Short-circuit health checks before they hit the backend or auth.',
          conditionMode: 'simple',
          pathValue: '/health',
          pathOperator: 'MatchesPath',
          verb: 'GET',
          condition: '(proxy.pathsuffix MatchesPath "/health") and (request.verb = "GET")',
          request: [{ policyName: 'AM-HealthCheckResponse' }],
          response: [],
        },
      ],
      routeRules: [{ id: 'rr-default', name: 'default', targetName: 'default', condition: '' }],
      faultRules: { steps: [] },
    },
  },
  {
    id: 'tpl-mediation',
    builtIn: true,
    name: 'Mediation & Fault Handling',
    description: 'Extracts a path parameter, reshapes the response payload, and returns clean JSON errors via a default fault rule.',
    tags: ['mediation'],
    proxy: {
      name: 'mediation-proxy',
      basePath: '/mediation',
      description: 'Demonstrates variable extraction, response mediation, and structured fault handling.',
      proxyEndpointName: 'default',
      policies: [
        policy('EV-ExtractResourceId', 'ExtractVariables'),
        policy('AM-ReshapeResponse', 'AssignMessage'),
        policy('RF-NotFound', 'RaiseFault'),
      ],
      targets: [target('default', 'https://mocktarget.apigee.net')],
      preFlow: { request: [{ policyName: 'EV-ExtractResourceId' }], response: [] },
      postFlow: { request: [], response: [{ policyName: 'AM-ReshapeResponse' }] },
      flows: [],
      routeRules: [{ id: 'rr-default', name: 'default', targetName: 'default', condition: '' }],
      faultRules: { steps: [{ policyName: 'RF-NotFound' }] },
    },
  },
  {
    id: 'tpl-dynamic-router',
    builtIn: true,
    name: 'Dynamic Target Router (OAuth + Target Server)',
    description:
      'PreFlow authenticates via a shared OAuth flow. Each conditional flow assigns the backend path into CompletePathUrl, and a Target Server-backed target routes using that variable as its Path. Unmatched requests fall through to a service-unavailable shared flow.',
    tags: ['routing', 'shared flows', 'target server'],
    proxy: {
      name: 'dynamic-service-router',
      basePath: '/dynamic-router',
      description:
        'Routes to different backend paths on a shared Target Server based on the incoming path, gated by a shared OAuth flow, with a service-unavailable fallback.',
      proxyEndpointName: 'default',
      policies: [
        customPolicy('FC-OAuth', 'FlowCallout', flowCalloutXml('FC-OAuth', 'oauth-v2-shared-flow')),
        customPolicy(
          'AM-SetPath-ServiceA',
          'AssignMessage',
          assignVariableXml('AM-SetPath-ServiceA', 'CompletePathUrl', '/service-a/v1')
        ),
        customPolicy(
          'AM-SetPath-ServiceB',
          'AssignMessage',
          assignVariableXml('AM-SetPath-ServiceB', 'CompletePathUrl', '/service-b/v1')
        ),
        customPolicy(
          'FC-ServiceUnavailable',
          'FlowCallout',
          flowCalloutXml('FC-ServiceUnavailable', 'service-unavailable-shared-flow')
        ),
      ],
      targets: [
        targetWithVariablePath(
          'default',
          ['backend-target-server'],
          'CompletePathUrl',
          'Path is resolved from CompletePathUrl, set by whichever conditional flow matched.'
        ),
      ],
      preFlow: { request: [{ policyName: 'FC-OAuth' }], response: [] },
      postFlow: { request: [], response: [] },
      flows: [
        simpleFlow({
          id: 'flow-service-a',
          name: 'Service A',
          description: 'Routes /service-a/* requests — sets CompletePathUrl before the TargetEndpoint runs.',
          pathValue: '/service-a/*',
          verb: 'ANY',
          steps: ['AM-SetPath-ServiceA'],
        }),
        simpleFlow({
          id: 'flow-service-b',
          name: 'Service B',
          description: 'Routes /service-b/* requests — sets CompletePathUrl before the TargetEndpoint runs.',
          pathValue: '/service-b/*',
          verb: 'ANY',
          steps: ['AM-SetPath-ServiceB'],
        }),
        simpleFlow({
          id: 'flow-default-unavailable',
          name: 'Default - Service Unavailable',
          description:
            'No condition — must stay last so it only catches requests that matched none of the routes above.',
          pathValue: '',
          verb: 'ANY',
          steps: ['FC-ServiceUnavailable'],
        }),
      ],
      routeRules: [{ id: 'rr-default', name: 'default', targetName: 'default', condition: '' }],
      faultRules: { steps: [] },
    },
  },
  {
    id: 'tpl-soap-to-rest',
    builtIn: true,
    name: 'SOAP-to-REST Facade',
    description:
      'JSON/REST facade over a SOAP backend. One example operation shows the full round trip: extract & validate, build the SOAP envelope, strip namespaces, convert to JSON, and remap SOAP Faults to HTTP status codes.',
    tags: ['soap-to-rest', 'mediation', 'fault-handling', 'shared flows'],
    proxy: {
      name: 'soap-to-rest-facade',
      basePath: '/soap-to-rest-facade',
      description: 'REST/JSON facade over a SOAP service. Converts JSON requests to SOAP, routes to the backend endpoint, and returns cleaned, namespace-free JSON responses.',
      proxyEndpointName: 'default',
      policies: [
        customPolicy(
          'EV-Extract-Example',
          'ExtractVariables',
          '<ExtractVariables name="EV-Extract-Example">\n    <DisplayName>Extract Request - Example</DisplayName>\n    <Source>request</Source>\n    <JSONPayload>\n        <Variable name="req.id" type="string">\n            <JSONPath>$.id</JSONPath>\n        </Variable>\n    </JSONPayload>\n    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>\n</ExtractVariables>\n'
        ),
        customPolicy(
          'RF-MissingRequiredField',
          'RaiseFault',
          '<RaiseFault name="RF-MissingRequiredField">\n    <DisplayName>Missing Required Field</DisplayName>\n    <FaultResponse>\n        <Set>\n            <Payload contentType="application/json">{"error":{"code":"MISSING_REQUIRED_FIELD","message":"A required field is missing or empty in the request body."}}</Payload>\n            <StatusCode>400</StatusCode>\n            <ReasonPhrase>Bad Request</ReasonPhrase>\n        </Set>\n    </FaultResponse>\n    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>\n</RaiseFault>\n'
        ),
        customPolicy(
          'RF-NotFound',
          'RaiseFault',
          '<RaiseFault name="RF-NotFound">\n    <DisplayName>Unknown Operation</DisplayName>\n    <FaultResponse>\n        <Set>\n            <Payload contentType="application/json">{"error":{"code":"NOT_FOUND","message":"No matching operation for this path/verb. TODO: list the valid paths for this service here."}}</Payload>\n            <StatusCode>404</StatusCode>\n            <ReasonPhrase>Not Found</ReasonPhrase>\n        </Set>\n    </FaultResponse>\n    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>\n</RaiseFault>\n'
        ),
        customPolicy(
          'AM-BuildRequest-Example',
          'AssignMessage',
          '<AssignMessage name="AM-BuildRequest-Example">\n    <DisplayName>Build SOAP Request - Example</DisplayName>\n    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>\n    <Set>\n        <Headers>\n            <Header name="SOAPAction">http://tempuri.org/TODO-INamespace/TODO-OperationName</Header>\n            <Header name="Content-Type">text/xml; charset=utf-8</Header>\n        </Headers>\n        <Payload contentType="text/xml"><![CDATA[<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="http://tempuri.org/">\n   <soapenv:Body>\n      <tns:TODO-OperationName>\n         <tns:Id>{req.id}</tns:Id>\n      </tns:TODO-OperationName>\n   </soapenv:Body>\n</soapenv:Envelope>]]></Payload>\n    </Set>\n    <AssignTo createNew="false" transport="http" type="request"/>\n</AssignMessage>\n'
        ),
        customPolicy('FC-OAuth', 'FlowCallout', flowCalloutXml('FC-OAuth', 'SF-OAuth')),
        customPolicy('FC-Service-Unavailable', 'FlowCallout', flowCalloutXml('FC-Service-Unavailable', 'SF-Service-Unavailable')),
        customPolicy('FC-ErrorHandling', 'FlowCallout', flowCalloutXml('FC-ErrorHandling', 'SF-generalErrorHandling')),
        customPolicyWithResource(
          'XSL-StripNamespaces',
          'XSL',
          '<XSL name="XSL-StripNamespaces">\n    <DisplayName>XSL-StripNamespaces</DisplayName>\n    <ResourceURL>xsl://strip-namespaces.xsl</ResourceURL>\n    <Source>response</Source>\n</XSL>\n',
          'resources/xsl/strip-namespaces.xsl',
          '<?xml version="1.0" encoding="UTF-8"?>\n<!-- XSL-StripNamespaces.xsl -->\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">\n<xsl:output method="xml" indent="no" omit-xml-declaration="yes"/>\n\n<!-- Strip prefix/namespace off every element -->\n<xsl:template match="*">\n    <xsl:element name="{local-name()}">\n        <xsl:apply-templates select="@*|node()"/>\n    </xsl:element>\n</xsl:template>\n\n<!-- Copy attributes without their namespace prefix (drop xsi:*, xmlns:* entirely) -->\n<xsl:template match="@*">\n    <xsl:if test="not(starts-with(name(), \'xmlns\')) and not(starts-with(name(), \'xsi:\'))">\n        <xsl:attribute name="{local-name()}">\n            <xsl:value-of select="."/>\n        </xsl:attribute>\n    </xsl:if>\n</xsl:template>\n\n<xsl:template match="comment()|processing-instruction()"/>\n\n<xsl:template match="text()">\n    <xsl:copy/>\n</xsl:template>\n</xsl:stylesheet>\n'
        ),
        customPolicy(
          'XMLToJSON-Response',
          'XMLToJSON',
          '<XMLToJSON name="XMLToJSON-Response">\n    <DisplayName>Convert SOAP Response to JSON</DisplayName>\n    <Source>response</Source>\n    <OutputVariable>response</OutputVariable>\n    <Options>\n        <RecognizeNumber>true</RecognizeNumber>\n        <RecognizeBoolean>true</RecognizeBoolean>\n        <RecognizeNull>true</RecognizeNull>\n        <NullValue>null</NullValue>\n        <NamespaceBlockName>#namespaces</NamespaceBlockName>\n        <DefaultNamespaceNodeName>#default</DefaultNamespaceNodeName>\n        <NamespaceSeparator>***</NamespaceSeparator>\n        <TextAlwaysAsProperty>false</TextAlwaysAsProperty>\n        <TextNodeName>TEXT</TextNodeName>\n        <AttributeBlockName>#attrs</AttributeBlockName>\n        <AttributePrefix></AttributePrefix>\n        <InvalidCharsReplacement>_</InvalidCharsReplacement>\n    </Options>\n</XMLToJSON>\n'
        ),
        customPolicyWithResource(
          'JS-CleanJSON',
          'Javascript',
          '<Javascript name="JS-CleanJSON" timeLimit="200">\n    <DisplayName>Clean JSON Response</DisplayName>\n    <Properties/>\n    <ResourceURL>jsc://cleanResponseJson.js</ResourceURL>\n</Javascript>\n',
          'resources/jsc/cleanResponseJson.js',
          `// JS-CleanJSON
// Runs after XSL-StripNamespaces + XMLToJSON-Response in the shared PostFlow Response.
// 1. Removes null/empty string/empty object/empty array nodes recursively.
// 2. Unwraps the SOAP Envelope/Body/<Operation>Response/<Operation>Result chain so the
//    client only sees the business object or a clean error object.
// 3. Detects SOAP Faults and remaps them to proper HTTP status codes. Adjust the
//    ErrorType -> status mapping below to match this backend's fault structure.

function isEmpty(val) {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.trim() === '';
    if (Array.isArray(val)) return val.length === 0;
    if (typeof val === 'object') return Object.keys(val).length === 0;
    return false;
}

// Recursively strip empty nodes and drop leftover namespace/attr metadata blocks
function clean(node) {
    if (Array.isArray(node)) {
        var arr = node.map(clean).filter(function (v) { return !isEmpty(v); });
        return arr;
    }
    if (node && typeof node === 'object') {
        var out = {};
        Object.keys(node).forEach(function (key) {
            if (key === '#namespaces' || key === '#attrs' || key === '#default') return;
            var cleaned = clean(node[key]);
            if (!isEmpty(cleaned)) {
                out[key] = cleaned;
            }
        });
        return out;
    }
    return node;
}

// Walk down a single-key chain, e.g. Envelope -> Body -> XxxResponse -> XxxResult
function unwrapChain(obj) {
    var current = obj;
    var guard = 0;
    while (current && typeof current === 'object' && !Array.isArray(current) && guard < 10) {
        var keys = Object.keys(current);
        if (keys.length !== 1) break;
        current = current[keys[0]];
        guard++;
    }
    return current;
}

try {
    var raw = context.getVariable('response.content');
    var parsed = raw ? JSON.parse(raw) : {};
    var cleaned = clean(parsed);

    var envelope = cleaned.Envelope || cleaned;
    var body = envelope.Body || envelope;

    var result;
    var httpStatus = null;

    if (body.Fault) {
        // SOAP Fault path — TODO: adjust to match this backend's detail/error structure.
        var fault = body.Fault;
        var detail = fault.detail || {};
        var errStruct = detail.commonErrorElement || unwrapChain(detail) || {};

        var errorType = errStruct.ErrorType || '';
        if (errorType === 'BusinessError') {
            httpStatus = 422;
        } else if (errorType === 'TechnicalError') {
            httpStatus = 502;
        } else {
            httpStatus = 500;
        }

        result = {
            error: {
                type: errorType || 'UnknownError',
                code: errStruct.Code || null,
                message: errStruct.ErrorText || fault.faultstring || 'An error occurred processing the request.',
                sourceAgency: errStruct.SourceAgency || null,
                raisedBy: errStruct.RaisedBy || null
            }
        };
    } else {
        // Success path: unwrap Body -> <Operation>Response -> <Operation>Result -> business object
        var afterBody = unwrapChain(body);
        result = clean(afterBody);
        if (isEmpty(result)) {
            result = {};
        }
    }

    context.setVariable('response.content', JSON.stringify(result));
    context.setVariable('response.header.Content-Type', 'application/json');

    if (httpStatus) {
        context.setVariable('response.status.code', httpStatus);
        context.setVariable('response.reason.phrase', httpStatus === 422 ? 'Unprocessable Entity' :
            (httpStatus === 502 ? 'Bad Gateway' : 'Internal Server Error'));
    }
} catch (e) {
    context.setVariable('response.content', JSON.stringify({
        error: { type: 'ParseError', message: 'Failed to parse or clean upstream response.', detail: String(e) }
    }));
    context.setVariable('response.header.Content-Type', 'application/json');
    context.setVariable('response.status.code', 502);
    context.setVariable('response.reason.phrase', 'Bad Gateway');
}
`
        ),
      ],
      targets: [
        {
          ...target(
            'Backend-Server',
            'https://TODO-CHANGE-ME.example.com/ExampleService/1.0/ExampleService.svc',
            'Routes to the backend SOAP service. Point this at the real .svc endpoint, or switch mode to targetServer if this SOAP service is reached through a shared gateway/Target Server.'
          ),
          preFlow: {
            request: [],
            response: [
              { policyName: 'XSL-StripNamespaces' },
              { policyName: 'XMLToJSON-Response' },
              { policyName: 'JS-CleanJSON' },
            ],
          },
        },
      ],
      preFlow: { request: [{ policyName: 'FC-OAuth' }], response: [] },
      postFlow: { request: [], response: [] },
      flows: [
        {
          id: 'flow-example',
          name: 'GetExample',
          description: 'POST /GetExample — TODO: rename to match your operation, duplicate this flow per operation.',
          conditionMode: 'simple',
          pathValue: '/GetExample',
          pathOperator: 'MatchesPath',
          verb: 'POST',
          condition: '(proxy.pathsuffix MatchesPath "/GetExample") and (request.verb = "POST")',
          request: [
            { policyName: 'EV-Extract-Example' },
            { policyName: 'RF-MissingRequiredField', condition: 'req.id = null or req.id = ""' },
            { policyName: 'AM-BuildRequest-Example' },
          ],
          response: [],
        },
        simpleFlow({
          id: 'flow-default-unavailable',
          name: 'Default - Service Unavailable',
          description: 'No condition — must stay last so it only catches requests that matched none of the routes above.',
          pathValue: '',
          verb: 'ANY',
          steps: ['FC-Service-Unavailable'],
        }),
      ],
      routeRules: [{ id: 'rr-default', name: 'ToBackend', targetName: 'Backend-Server', condition: '' }],
      faultRules: { steps: [{ policyName: 'FC-ErrorHandling' }] },
    },
  },
];
