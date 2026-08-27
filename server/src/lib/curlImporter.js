import { parse as tokenizeShell } from 'shell-quote';
import { nanoid } from 'nanoid';
import { escapeXml, XML_HEADER } from './xml.js';
import { slugify, normalizeProxy, buildFlowCondition } from './model.js';

// Headers curl/the HTTP stack recomputes on the way out — carrying the
// captured value forward would just be wrong once the request is mediated.
const DROPPED_HEADERS = new Set(['host', 'content-length']);

const KNOWN_VERBS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']);

// Flags that take a value but carry no information we scaffold from —
// consumed (so their value token isn't mistaken for the URL) and otherwise ignored.
const IGNORED_VALUE_FLAGS = new Set([
  '--connect-timeout', '--max-time', '-m', '--retry', '--limit-rate', '--interface',
  '--cacert', '--cert', '--key', '--proxy', '-x', '--resolve', '--dns-servers',
  '--data-urlencode', // value itself unused, but still "has a body" (handled separately)
  // These take a value too. Misclassifying any of them as boolean leaves the
  // value token loose, and the loop below then reads it as the URL: `curl -o
  // out.json https://api.example.com/pets` used to fail with "out.json isn't a
  // valid absolute URL".
  '-o', '--output', '-D', '--dump-header', '-w', '--write-out',
  '--oauth2-bearer', '--max-redirs', '--proxy-user', '-U',
  '--cert-type', '--key-type', '--pass', '--capath', '--ciphers',
  '--retry-delay', '--retry-max-time', '--expect100-timeout', '--range', '-r',
]);

// Boolean flags that take no value — safe to skip silently, no warning noise.
const IGNORED_BOOLEAN_FLAGS = new Set([
  '-k', '--insecure', '-s', '--silent', '-v', '--verbose', '-i', '--include',
  '-L', '--location', '--compressed', '-#', '--progress-bar', '-f', '--fail',
  '-g', '--globoff', '-4', '--ipv4', '-6', '--ipv6', '--http1.1', '--http2',
  '-N', '--no-buffer', '-O', '--remote-name', '-J', '--remote-header-name',
  '-S', '--show-error', '--fail-with-body', '--no-progress-meter', '-Z', '--parallel',
]);

function tokenize(curlText) {
  // Bash "Copy as cURL" wraps onto multiple lines with a trailing backslash;
  // collapse that continuation before handing off to the shell tokenizer.
  const collapsed = curlText.replace(/\\\r?\n/g, ' ');
  return tokenizeShell(collapsed)
    .filter((t) => typeof t === 'string');
}

// `new URL()` alone is too permissive to pick the URL out of a token list:
// "C:/tmp/out.json" parses fine (scheme "c:"), and so does "localhost:8080/x"
// (scheme "localhost:"). Requiring http/https keeps a stray filename from
// winning the URL slot.
function isHttpUrl(token) {
  try {
    const protocol = new URL(token).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function parseHeaderToken(raw) {
  const idx = raw.indexOf(':');
  if (idx === -1) return null;
  return { name: raw.slice(0, idx).trim(), value: raw.slice(idx + 1).trim() };
}

export function parseCurlToProxy(curlText) {
  if (!curlText || !curlText.trim()) {
    throw new Error('Paste a curl command first.');
  }

  const tokens = tokenize(curlText);
  if (tokens[0] === 'curl' || tokens[0] === 'curl.exe') tokens.shift();

  let method = null;
  let hasBody = false;
  let impliedMethod = null;
  let explicitUrl = null;
  const headers = [];
  const ignoredFlags = new Set();
  // Every token that isn't a flag or a flag's value. The URL is picked from
  // these *after* the scan (see below) rather than by taking the first one, so
  // an unrecognized value-taking flag can't silently donate its value as the URL.
  const bareTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '-X' || t === '--request') {
      method = tokens[++i];
    } else if (t === '-H' || t === '--header') {
      const header = parseHeaderToken(tokens[++i] ?? '');
      if (header) headers.push(header);
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary' || t === '--data-ascii') {
      i++; // skip the body value — not replayed, just signals a body is present
      hasBody = true;
    } else if (t === '--data-urlencode') {
      i++;
      hasBody = true;
    } else if (t === '-F' || t === '--form' || t === '--form-string') {
      i++; // multipart field — not replayed, but it does mean there's a body
      hasBody = true;
    } else if (t === '-T' || t === '--upload-file') {
      i++;
      hasBody = true;
      impliedMethod = 'PUT'; // curl -T uploads with PUT unless -X says otherwise
    } else if (t === '-u' || t === '--user') {
      const credentials = tokens[++i] ?? '';
      headers.push({ name: 'Authorization', value: `Basic ${Buffer.from(credentials, 'utf-8').toString('base64')}` });
    } else if (t === '-A' || t === '--user-agent') {
      headers.push({ name: 'User-Agent', value: tokens[++i] ?? '' });
    } else if (t === '-b' || t === '--cookie') {
      headers.push({ name: 'Cookie', value: tokens[++i] ?? '' });
    } else if (t === '-e' || t === '--referer') {
      headers.push({ name: 'Referer', value: tokens[++i] ?? '' });
    } else if (t === '--url') {
      explicitUrl = tokens[++i] ?? null;
    } else if (IGNORED_VALUE_FLAGS.has(t)) {
      i++;
    } else if (IGNORED_BOOLEAN_FLAGS.has(t)) {
      // no-op
    } else if (t.startsWith('-')) {
      ignoredFlags.add(t);
    } else {
      bareTokens.push(t);
    }
  }

  // An explicit --url wins. Otherwise prefer the first bare token that parses
  // as an absolute URL: that way an unrecognized value-taking flag whose value
  // landed in `bareTokens` is skipped over instead of being mistaken for the
  // URL. Falling back to the first bare token keeps the "not an absolute URL"
  // error message for a genuinely relative URL.
  const url = explicitUrl ?? bareTokens.find(isHttpUrl) ?? bareTokens[0] ?? null;
  if (!url) {
    throw new Error("Couldn't find a URL in that curl command.");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`"${url}" isn't a valid absolute URL — curl commands with a relative URL or a shell variable in place of the host aren't supported.`);
  }

  let verb = (method || impliedMethod || (hasBody ? 'POST' : 'GET')).toUpperCase();
  const warnings = [];
  if (!KNOWN_VERBS.has(verb)) {
    warnings.push(`Unrecognized HTTP method "${verb}" — the captured flow's verb was set to ANY; adjust it in the Proxy Endpoint tab.`);
    verb = 'ANY';
  }

  const keptHeaders = headers.filter((h) => !DROPPED_HEADERS.has(h.name.toLowerCase()));
  if (keptHeaders.some((h) => h.name.toLowerCase() === 'authorization')) {
    warnings.push('Credentials from your curl command (Authorization header) were copied verbatim into the generated policy — review before sharing or exporting this proxy.');
  }
  if (hasBody) {
    warnings.push('The request body from your curl command is not replayed anywhere — this proxy forwards whatever body the real caller sends through as-is.');
  }
  if (ignoredFlags.size) {
    warnings.push(`Ignored unsupported curl flag${ignoredFlags.size === 1 ? '' : 's'}: ${[...ignoredFlags].join(', ')}.`);
  }

  // A percent-escape the URL parser tolerated can still be malformed as far as
  // decodeURIComponent is concerned ("%zz"), and it throws a bare URIError that
  // surfaced to the user as "URI malformed". The encoded form is a fine fallback.
  let pathname;
  try {
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch {
    pathname = parsedUrl.pathname;
    warnings.push('The URL path contains a malformed percent-escape, so it was kept in its encoded form — check the generated flow condition.');
  }
  const segments = pathname.split('/').filter(Boolean);
  const basePath = segments.length ? `/${segments[0]}` : '/imported-request';
  const remainder = `/${segments.slice(1).join('/')}`;

  const proxyName = slugify(parsedUrl.hostname) || 'curl-import';
  const policies = [];
  const requestSteps = [];

  if (keptHeaders.length) {
    const policyName = 'AM-CapturedHeaders';
    const headerLines = keptHeaders
      .map((h) => `            <Header name="${escapeXml(h.name)}">${escapeXml(h.value)}</Header>`)
      .join('\n');
    policies.push({
      id: nanoid(10),
      name: policyName,
      type: 'AssignMessage',
      xml: `${XML_HEADER}<AssignMessage continueOnError="false" enabled="true" name="${escapeXml(policyName)}">
    <DisplayName>${escapeXml(policyName)}</DisplayName>
    <Add>
        <Headers>
${headerLines}
        </Headers>
    </Add>
    <AssignTo createNew="false" type="request"/>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</AssignMessage>`,
    });
    requestSteps.push({ policyName });
  }

  const pathValue = remainder === '/' ? '' : remainder;
  const condition = buildFlowCondition('Equals', pathValue, verb);
  if (pathValue.includes('"')) {
    warnings.push(`The URL path contains a double quote, which Apigee's condition grammar cannot represent — it was dropped from the generated flow condition.`);
  }

  const flow = {
    id: nanoid(10),
    name: 'Captured Request',
    description: `Scaffolded from a pasted curl command: ${verb} ${parsedUrl.href}`,
    conditionMode: 'simple',
    pathValue,
    pathOperator: 'Equals',
    verb,
    condition,
    request: requestSteps,
    response: [],
  };

  const proxy = {
    id: nanoid(10),
    name: proxyName,
    basePath,
    description: `Scaffolded from a pasted curl command: ${verb} ${parsedUrl.href}`,
    proxyEndpointName: 'default',
    policies,
    targets: [
      {
        id: nanoid(8),
        name: 'default',
        description: 'Default Target Endpoint',
        mode: 'url',
        url: { mode: 'literal', value: parsedUrl.origin },
        targetServers: [],
        preFlow: { request: [], response: [] },
        postFlow: { request: [], response: [] },
        flows: [],
        faultRules: { steps: [] },
      },
    ],
    preFlow: { request: [], response: [] },
    postFlow: { request: [], response: [] },
    flows: [flow],
    routeRules: [{ id: nanoid(8), name: 'default', targetName: 'default', condition: '' }],
    faultRules: { steps: [] },
    lintExcludes: [],
    environments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return { proxy: normalizeProxy(proxy), warnings };
}
