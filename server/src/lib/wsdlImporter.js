import { XMLParser } from 'fast-xml-parser';
import { nanoid } from 'nanoid';
import { escapeXml, XML_HEADER } from './xml.js';
import { slugify, normalizeProxy } from './model.js';
import { asArray } from './xmlImportUtils.js';

// WSDL/SOAP extensibility elements (soap:binding, soap:operation, soap:address)
// deliberately reuse the same local name as their enclosing WSDL element
// (wsdl:binding, wsdl:operation) but live in a different namespace, one
// level down — so matching by local name and letting nesting disambiguate
// works without needing full namespace-URI resolution for structure.
const REPEATABLE_LOCAL_NAMES = new Set(['service', 'binding', 'port', 'operation', 'message', 'part']);

function localName(tagName) {
  const idx = tagName.lastIndexOf(':');
  return idx === -1 ? tagName : tagName.slice(idx + 1);
}

const wsdlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => REPEATABLE_LOCAL_NAMES.has(localName(name)),
});

// Finds a child element by local name regardless of the namespace prefix the
// WSDL author chose (wsdl:, ns0:, or no prefix at all if wsdl is the default
// namespace) — real-world WSDLs are inconsistent about this.
function child(obj, name) {
  if (!obj || typeof obj !== 'object') return undefined;
  const key = Object.keys(obj).find((k) => localName(k) === name);
  return key ? obj[key] : undefined;
}

function childKey(obj, name) {
  if (!obj || typeof obj !== 'object') return undefined;
  return Object.keys(obj).find((k) => localName(k) === name);
}

function attr(obj, name) {
  return obj?.[`@_${name}`];
}

function stripPrefix(qname) {
  const s = String(qname || '');
  return s.includes(':') ? s.split(':').pop() : s;
}

// Maps the xmlns:prefix declarations on the root <definitions> element so a
// found extensibility element's prefix can be resolved back to its real
// namespace URI — the only reliable way to tell a soap:binding from a
// soap12:binding, since authors can name that prefix anything.
function buildNsMap(definitions) {
  const map = {};
  for (const [k, v] of Object.entries(definitions)) {
    if (k === '@_xmlns') map[''] = v;
    else if (k.startsWith('@_xmlns:')) map[k.slice('@_xmlns:'.length)] = v;
  }
  return map;
}

const SOAP11_NS = 'http://schemas.xmlsoap.org/wsdl/soap/';
const SOAP12_NS = 'http://schemas.xmlsoap.org/wsdl/soap12/';

// soap:binding / soap:operation extensibility elements share a local name
// with their enclosing wsdl:binding / wsdl:operation, so the isArray rule
// above (needed to array the *outer* collections) also arrays these nested,
// single-occurrence elements — unwrap before reading their attributes.
function unwrap(value) {
  return Array.isArray(value) ? value[0] : value;
}

function sanitizeName(name) {
  return String(name || 'operation').replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'operation';
}

// Parses a WSDL (single self-contained file — external <xsd:import>/
// <wsdl:import> references aren't resolved in v1) into a SOAP Pass-Through
// proxy: one conditional Flow per binding operation, routed by SOAPAction,
// plus a SOAPMessageValidation policy carrying the real WSDL as its bundled
// resource (see policyTemplates.js's SOAPMessageValidation template, which
// this fills in for real instead of leaving the placeholder stub).
export function parseWsdlToProxy(wsdlText) {
  const trimmed = String(wsdlText || '').replace(/^﻿/, '').trim();
  if (!trimmed) throw new Error('Paste or upload a WSDL file first.');

  let parsed;
  try {
    parsed = wsdlParser.parse(trimmed);
  } catch (err) {
    throw new Error(`Could not parse this as XML: ${err.message}`);
  }

  const definitions = child(parsed, 'definitions');
  if (!definitions) {
    throw new Error('Not a valid WSDL file — missing a <definitions> root element.');
  }

  const nsMap = buildNsMap(definitions);
  const namespaceOf = (key) => nsMap[key.includes(':') ? key.split(':')[0] : ''] || '';

  const warnings = [];

  const services = asArray(child(definitions, 'service'));
  if (!services.length) throw new Error('This WSDL has no <service> element to import.');
  const service = services[0];
  const serviceName = attr(service, 'name') || 'service';
  if (services.length > 1) {
    warnings.push(`This WSDL defines ${services.length} services; only "${serviceName}" was imported.`);
  }

  const ports = asArray(child(service, 'port'));
  if (!ports.length) throw new Error(`Service "${serviceName}" has no <port> to import.`);
  const port = ports[0];
  if (ports.length > 1) {
    warnings.push(`Service "${serviceName}" defines ${ports.length} ports; only "${attr(port, 'name') || 'the first'}" was imported.`);
  }

  const addressKey = childKey(port, 'address');
  const address = addressKey ? port[addressKey] : undefined;
  const targetUrl = address ? attr(address, 'location') || '' : '';
  if (!targetUrl) {
    warnings.push('Could not find a SOAP address location in the WSDL — set the Target Endpoint URL manually.');
  }

  const bindingRef = stripPrefix(attr(port, 'binding'));
  const bindings = asArray(child(definitions, 'binding'));
  const binding = bindings.find((b) => attr(b, 'name') === bindingRef) || bindings[0];
  if (!binding) {
    throw new Error(`Could not find the <binding> "${bindingRef || '(unnamed)'}" referenced by port "${attr(port, 'name') || ''}".`);
  }

  const bindingExtKey = childKey(binding, 'binding');
  const bindingExt = bindingExtKey ? unwrap(binding[bindingExtKey]) : undefined;
  const style = bindingExt && attr(bindingExt, 'style') === 'rpc' ? 'rpc' : 'document';
  const soapVersion = bindingExtKey && namespaceOf(bindingExtKey) === SOAP12_NS ? '1.2' : '1.1';

  if (soapVersion === '1.2') {
    warnings.push('This is a SOAP 1.2 binding — SOAP 1.2 carries the action in the Content-Type header, not a SOAPAction header, so the generated flow conditions (which match request.header.SOAPAction) may need manual adjustment.');
  }

  const bindingOperations = asArray(child(binding, 'operation'));
  const flows = [];
  const missingSoapAction = [];
  const usedFlowNames = new Set();

  for (const op of bindingOperations) {
    const opName = attr(op, 'name') || `operation-${flows.length + 1}`;
    const opExtKey = childKey(op, 'operation');
    const opExt = opExtKey ? unwrap(op[opExtKey]) : undefined;
    const soapAction = opExt ? attr(opExt, 'soapAction') || '' : '';
    if (!soapAction) missingSoapAction.push(opName);

    let flowName = sanitizeName(opName);
    if (usedFlowNames.has(flowName)) {
      let n = 2;
      while (usedFlowNames.has(`${flowName}-${n}`)) n++;
      flowName = `${flowName}-${n}`;
    }
    usedFlowNames.add(flowName);

    // The raw SOAPAction header value carries literal quote characters per
    // the SOAP 1.1 HTTP binding spec (e.g. SOAPAction: "urn:GetWeather").
    // Apigee's condition grammar has no way to represent a literal quote
    // inside a string literal at all (no backslash-escape, no alternate
    // quote character) — so an exact-equality match against the quoted
    // value can't be written. A "Like" wildcard match sidesteps that: the
    // leading/trailing `*` absorb the header's surrounding quotes, and the
    // pattern itself never needs to contain one.
    const condition = soapAction
      ? `request.header.SOAPAction Like "*${soapAction}*"`
      : `request.header.SOAPAction Like "*${opName}*"`;

    flows.push({
      id: nanoid(10),
      name: flowName,
      description: opName,
      conditionMode: 'custom',
      condition,
      request: [],
      response: [],
    });
  }

  if (!flows.length) {
    warnings.push("No operations were found in this WSDL's binding — the proxy was still created, but has no conditional flows.");
  } else {
    warnings.unshift(`Imported ${flows.length} operation${flows.length === 1 ? '' : 's'} from the "${attr(binding, 'name') || bindingRef}" binding as SOAP Pass-Through flows.`);
  }
  if (missingSoapAction.length) {
    warnings.push(`No SOAPAction was declared for: ${missingSoapAction.join(', ')} — the generated condition falls back to matching the operation name, which may not match real traffic; review these flows.`);
  }

  const proxyName = slugify(serviceName) || 'wsdl-import';
  const basePath = `/${slugify(serviceName) || 'imported'}`;

  // apigeelint's PO007 rule expects MessageValidation policy names to carry
  // one of its recognized prefixes ("messagevalidation", "mv", "messval") —
  // matching it means a freshly-imported proxy lints clean.
  const validationPolicyName = 'mv-validate-soap-request';
  const validationPolicy = {
    id: nanoid(10),
    name: validationPolicyName,
    type: 'MessageValidation',
    xml: `${XML_HEADER}<MessageValidation continueOnError="false" enabled="true" name="${escapeXml(validationPolicyName)}">
    <DisplayName>${escapeXml(validationPolicyName)}</DisplayName>
    <Source>request</Source>
    <SOAPMessage version="${soapVersion}"/>
    <ResourceURL>wsdl://service.wsdl</ResourceURL>
</MessageValidation>`,
    resource: { path: 'resources/wsdl/service.wsdl', content: trimmed },
  };

  const proxy = {
    id: nanoid(10),
    name: proxyName,
    basePath,
    description: `Imported from WSDL service "${serviceName}" (SOAP ${soapVersion}, ${style} style) — routes by SOAPAction, see the generated conditional flows.`,
    proxyEndpointName: 'default',
    policies: [validationPolicy],
    targets: [
      {
        id: nanoid(8),
        name: 'default',
        description: 'SOAP backend (from the WSDL soap:address)',
        mode: 'url',
        url: { mode: 'literal', value: targetUrl || 'https://' },
        targetServers: [],
        preFlow: { request: [], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { steps: [] },
      },
    ],
    preFlow: { request: [{ policyName: validationPolicyName }], response: [] },
    postFlow: { request: [], response: [] },
    flows,
    routeRules: [{ id: nanoid(8), name: 'default', targetName: 'default', condition: '' }],
    faultRules: { steps: [] },
    lintExcludes: [],
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { proxy: normalizeProxy(proxy), warnings };
}
