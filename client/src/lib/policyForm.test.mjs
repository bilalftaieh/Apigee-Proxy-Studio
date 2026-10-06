import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The visual policy editor's serializer, held against the Apigee X policy
 * reference (https://cloud.google.com/apigee/docs/api-platform/reference/policies/).
 *
 * The bug worth keeping fixed: the editor used to regenerate the whole policy
 * from POLICY_SCHEMAS on the first keystroke. Everything the schema didn't
 * model was deleted (<AssignVariable>, <SSLInfo>, …), and every schema default
 * was written whether or not the user had set it — which is how typing a
 * display name into an AssignMessage policy came to add <Set><Verb>GET</Verb>
 * and a wide-open <Copy source="request"/>. So the tests are mostly about what
 * an edit must NOT touch.
 *
 * Run with `npm run test:policy-form` (see scripts/test-policy-form.mjs, which
 * bundles the TypeScript and supplies a DOMParser).
 */
const { buildPolicyXml, parsePolicyXml, getPolicySchema, DISPLAY_NAME_DIRTY_KEY, rootAttrDirtyKey } = globalThis.__POLICY_FORM__;
const { POLICY_TYPES } = globalThis.__POLICY_TEMPLATES__;

/** Parses `xml`, marks `dirty` as touched, and serializes it back. */
function edit(xml, type, dirty, mutate) {
  const schema = getPolicySchema(type);
  assert.ok(schema, `no schema for ${type}`);
  const form = parsePolicyXml(xml, schema);
  assert.ok(form, `${type} XML did not map onto the schema`);
  if (mutate) mutate(form);
  return buildPolicyXml('P1', form, schema, xml, new Set(dirty));
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

test('touching one field leaves every built-in template byte-identical', () => {
  for (const t of POLICY_TYPES) {
    const type = t.xmlTag || t.key;
    if (!getPolicySchema(type)) continue;
    const xml = t.defaultXml('P1');
    const out = edit(xml, type, [DISPLAY_NAME_DIRTY_KEY]);
    assert.equal(squash(out), squash(xml), `${t.key} drifted when only the display name was touched`);
  }
});

test('elements the schema does not model survive an edit', () => {
  // <AssignVariable> has no visual field at all, and <Payload contentType> is
  // the kind of attribute the old builder dropped because it matched a default.
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <AssignVariable>
        <Name>target.url</Name>
        <Value>https://example.com/v2</Value>
    </AssignVariable>
    <Set>
        <Payload contentType="application/json">{"a":1}</Payload>
    </Set>
</AssignMessage>`;

  const out = edit(xml, 'AssignMessage', ['setHeaders'], (form) => {
    form.fields.setHeaders = { kind: 'kv-list', items: [{ name: 'X-Trace', value: '{messageid}' }] };
  });

  assert.match(out, /<AssignVariable>/);
  assert.match(out, /<Name>target\.url<\/Name>/);
  assert.match(out, /<Payload contentType="application\/json">/);
  assert.match(out, /<Header name="X-Trace">\{messageid\}<\/Header>/);
  // None of the schema's other defaults may appear.
  assert.doesNotMatch(out, /<Verb>/);
  assert.doesNotMatch(out, /<Copy/);
  assert.doesNotMatch(out, /IgnoreUnresolvedVariables/);
});

test('a quota edit never injects UseQuotaConfigInAPIProduct', () => {
  // Adding that element makes Apigee ignore Allow/Interval/TimeUnit, and the
  // builder used to add a half-built one (no stepName, no Allow, no Interval).
  const xml = POLICY_TYPES.find((t) => t.key === 'Quota').defaultXml('P1');
  const out = edit(xml, 'Quota', ['interval'], (form) => {
    form.fields.interval = { kind: 'text', value: '3' };
  });

  assert.doesNotMatch(out, /UseQuotaConfigInAPIProduct/);
  assert.match(out, /<Interval>3<\/Interval>/);
  assert.match(out, /<Allow count="1000"\/>/);
});

test('MessageLogging keeps CloudLogging and Syslog mutually exclusive', () => {
  const xml = POLICY_TYPES.find((t) => t.key === 'MessageLogging').defaultXml('P1');
  const out = edit(xml, 'MessageLogging', ['logName'], (form) => {
    form.fields.logName = { kind: 'text', value: 'projects/p/logs/l' };
  });

  assert.match(out, /<LogName>projects\/p\/logs\/l<\/LogName>/);
  assert.doesNotMatch(out, /<Syslog>/);
  assert.doesNotMatch(out, /<logLevel>/);
});

test('clearing a field removes its element, and the container it emptied', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Set>
        <Path>/v1/resource</Path>
    </Set>
</AssignMessage>`;

  const out = edit(xml, 'AssignMessage', ['setPath'], (form) => {
    form.fields.setPath = { kind: 'text', value: '' };
  });

  assert.doesNotMatch(out, /<Path>/);
  assert.doesNotMatch(out, /<Set>/, 'an emptied <Set> should go too');
});

test('editing a field replaces its value rather than duplicating the element', () => {
  const xml = POLICY_TYPES.find((t) => t.key === 'SpikeArrest').defaultXml('P1');
  const out = edit(xml, 'SpikeArrest', ['rate'], (form) => {
    form.fields.rate = { kind: 'ref', mode: 'literal', value: '10pm' };
  });

  assert.equal(out.match(/<Rate>/g).length, 1);
  assert.match(out, /<Rate>10pm<\/Rate>/);
  assert.match(out, /<Identifier ref="request\.header\.some-header-name"\/>/);
});

test('an untouched root attribute is left alone, a touched one is written', () => {
  // Omitting Quota's `type` is meaningful — it selects the default counter
  // bucket — so the form's fallback must not be written back unasked.
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Quota continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Allow count="10"/>
    <Interval>1</Interval>
    <TimeUnit>day</TimeUnit>
</Quota>`;

  assert.doesNotMatch(edit(xml, 'Quota', [DISPLAY_NAME_DIRTY_KEY]), /type=/);

  const retyped = edit(xml, 'Quota', [rootAttrDirtyKey('type')], (form) => {
    form.common.rootAttrValues.type = 'rollingwindow';
  });
  assert.match(retyped, /type="rollingwindow"/);
});

test('the deprecated async attribute is dropped on write', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<VerifyAPIKey async="false" continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <APIKey ref="request.queryparam.apikey"/>
</VerifyAPIKey>`;

  assert.doesNotMatch(edit(xml, 'VerifyAPIKey', [DISPLAY_NAME_DIRTY_KEY]), /async=/);
});

test('XML that does not map onto the schema still builds from the form', () => {
  const schema = getPolicySchema('VerifyAPIKey');
  const form = parsePolicyXml('<Nonsense/>', schema);
  assert.equal(form, null, 'unmappable XML should report itself as such');

  // That is the editor's "replace the policy" path: no base, no dirty set.
  const out = buildPolicyXml('P1', { common: { displayName: '', enabled: true, continueOnError: false, rootAttrValues: {} }, fields: { apiKey: { kind: 'ref', mode: 'variable', value: 'request.header.apikey' } } }, schema);
  assert.match(out, /<VerifyAPIKey /);
  assert.match(out, /<APIKey ref="request\.header\.apikey"\/>/);
});

test('AssignVariable round-trips, including its three source shapes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <AssignVariable>
        <Name>target.url</Name>
        <Value>https://example.com/v2</Value>
    </AssignVariable>
    <AssignVariable>
        <Name>caller</Name>
        <Ref>client.host</Ref>
    </AssignVariable>
    <AssignVariable>
        <Name>summary</Name>
        <Template>{request.verb} {request.uri}</Template>
    </AssignVariable>
</AssignMessage>`;

  const schema = getPolicySchema('AssignMessage');
  const form = parsePolicyXml(xml, schema);
  assert.deepEqual(form.fields.assignVariables, {
    kind: 'assign-variables',
    items: [
      { name: 'target.url', mode: 'Value', value: 'https://example.com/v2' },
      { name: 'caller', mode: 'Ref', value: 'client.host' },
      { name: 'summary', mode: 'Template', value: '{request.verb} {request.uri}' },
    ],
  });

  // Rewriting the field must reproduce all three, not collapse them.
  const out = buildPolicyXml('P1', form, schema, xml, new Set(['assignVariables']));
  assert.equal(squash(out), squash(xml));
});

test('an added AssignVariable lands without disturbing the rest', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Set>
        <Headers>
            <Header name="Content-Type">application/json</Header>
        </Headers>
    </Set>
</AssignMessage>`;

  const out = edit(xml, 'AssignMessage', ['assignVariables'], (form) => {
    form.fields.assignVariables = { kind: 'assign-variables', items: [{ name: 'target.url', mode: 'Value', value: 'https://example.com' }] };
  });

  assert.match(out, /<AssignVariable>\s*<Name>target\.url<\/Name>\s*<Value>https:\/\/example\.com<\/Value>\s*<\/AssignVariable>/);
  assert.match(out, /<Header name="Content-Type">application\/json<\/Header>/);
});

test('CloudLogging labels use Key/Value children, not a name attribute', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<MessageLogging continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <CloudLogging>
        <LogName>projects/p/logs/l</LogName>
        <Labels>
            <Label>
                <Key>env</Key>
                <Value>prod</Value>
            </Label>
        </Labels>
    </CloudLogging>
</MessageLogging>`;

  const schema = getPolicySchema('MessageLogging');
  const form = parsePolicyXml(xml, schema);
  assert.deepEqual(form.fields.labels, { kind: 'kv-list', items: [{ name: 'env', value: 'prod' }] });
  assert.equal(squash(buildPolicyXml('P1', form, schema, xml, new Set(['labels']))), squash(xml));
});

test('every policy type has a visual editor', () => {
  const missing = POLICY_TYPES.filter((t) => !getPolicySchema(t.xmlTag || t.key)).map((t) => t.key);
  assert.deepEqual(missing, [], 'these types fall back to XML-only editing');
});

test('a derived schema is as inert as a hand-written one', () => {
  // The whole safety argument rests on this: a schema the reference scraper
  // produced gets the same "write only what was touched" treatment, so a field
  // derived slightly wrong still cannot change a policy on its own.
  for (const t of POLICY_TYPES) {
    const type = t.xmlTag || t.key;
    const schema = getPolicySchema(type);
    if (!schema.derived) continue;
    const xml = t.defaultXml('P1');
    const form = parsePolicyXml(xml, schema);
    assert.ok(form, `${t.key} default XML did not map onto its derived schema`);
    const out = buildPolicyXml('P1', form, schema, xml, new Set([DISPLAY_NAME_DIRTY_KEY]));
    assert.equal(squash(out), squash(xml), `${t.key} drifted under its derived schema`);
  }
});

test('derivation never invents a default, only a placeholder', () => {
  // A `default` is what the editor shows for an absent element. Presenting
  // Apigee's documented default as though the policy had set it is one edit
  // away from writing it back, so derived text fields carry it as placeholder.
  for (const t of POLICY_TYPES) {
    const schema = getPolicySchema(t.xmlTag || t.key);
    if (!schema.derived) continue;
    for (const f of schema.sections.flatMap((s) => s.fields)) {
      if (f.type === 'text' || f.type === 'number' || f.type === 'ref') {
        assert.equal(f.default, undefined, `${t.key}/${f.id} carries a derived default`);
      }
    }
  }
});

test('a derived field edits the element it names', () => {
  // FlowCallout is the smallest honest end-to-end case: no hand-written schema,
  // one required element, and a policy people actually reach for.
  const xml = POLICY_TYPES.find((t) => t.key === 'FlowCallout').defaultXml('P1');
  const schema = getPolicySchema('FlowCallout');
  assert.ok(schema.derived);

  const form = parsePolicyXml(xml, schema);
  const field = schema.sections.flatMap((s) => s.fields).find((f) => f.path.join('/') === 'SharedFlowBundle');
  assert.ok(field, 'SharedFlowBundle should have a field');

  form.fields[field.id] = { kind: 'text', value: 'SF-OAuth' };
  const out = buildPolicyXml('P1', form, schema, xml, new Set([field.id]));
  assert.match(out, /<SharedFlowBundle>SF-OAuth<\/SharedFlowBundle>/);
  assert.equal(out.match(/<SharedFlowBundle>/g).length, 1);
});

test('ExtractVariables round-trips every repeating source it supports', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ExtractVariables continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Source clearPayload="false">request</Source>
    <URIPath>
        <Pattern ignoreCase="true">/accounts/{id}</Pattern>
    </URIPath>
    <QueryParam name="w">
        <Pattern ignoreCase="true">{firstWeather}</Pattern>
    </QueryParam>
    <QueryParam name="w.2">
        <Pattern ignoreCase="true">{secondWeather}</Pattern>
    </QueryParam>
    <JSONPayload>
        <Variable name="latitude" type="float">
            <JSONPath>$.results[0].geometry.location.lat</JSONPath>
        </Variable>
        <Variable name="longitude" type="float">
            <JSONPath>$.results[0].geometry.location.lng</JSONPath>
        </Variable>
    </JSONPayload>
    <XMLPayload stopPayloadProcessing="false">
        <Namespaces>
            <Namespace prefix="apigee">http://www.apigee.com</Namespace>
        </Namespaces>
        <Variable name="legName" type="string">
            <XPath>/apigee:Directions/apigee:route/apigee:leg/apigee:name</XPath>
        </Variable>
    </XMLPayload>
    <VariablePrefix>geo</VariablePrefix>
</ExtractVariables>`;

  const schema = getPolicySchema('ExtractVariables');
  assert.ok(!schema.derived, 'ExtractVariables should be hand-written');
  const form = parsePolicyXml(xml, schema);

  assert.deepEqual(form.fields.queryParams.items, [
    { attrs: { name: 'w' }, values: [{ text: '{firstWeather}', attrs: { ignoreCase: 'true' } }] },
    { attrs: { name: 'w.2' }, values: [{ text: '{secondWeather}', attrs: { ignoreCase: 'true' } }] },
  ]);
  assert.deepEqual(form.fields.jsonVariables.items[0], {
    attrs: { name: 'latitude', type: 'float' },
    values: [{ text: '$.results[0].geometry.location.lat', attrs: {} }],
  });
  // No valueTag: the <Pattern> carries both its attribute and its text.
  assert.deepEqual(form.fields.uriPath.items, [{ attrs: { ignoreCase: 'true' }, values: [{ text: '/accounts/{id}', attrs: {} }] }]);

  const dirty = new Set(['uriPath', 'queryParams', 'jsonVariables', 'xmlVariables', 'namespaces']);
  assert.equal(squash(buildPolicyXml('P1', form, schema, xml, dirty)), squash(xml));
});

test('adding a second QueryParam writes a second element', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ExtractVariables continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Source>request</Source>
    <QueryParam name="w">
        <Pattern ignoreCase="true">{firstWeather}</Pattern>
    </QueryParam>
</ExtractVariables>`;

  const out = edit(xml, 'ExtractVariables', ['queryParams'], (form) => {
    form.fields.queryParams.items.push({ attrs: { name: 'w.2' }, values: [{ text: '{secondWeather}', attrs: {} }] });
  });

  assert.equal(out.match(/<QueryParam /g).length, 2);
  assert.match(out, /<QueryParam name="w\.2">\s*<Pattern>\{secondWeather\}<\/Pattern>\s*<\/QueryParam>/);
  assert.match(out, /<Pattern ignoreCase="true">\{firstWeather\}<\/Pattern>/);
});

test('a JSON variable can hold more than one path', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ExtractVariables continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <JSONPayload>
        <Variable name="id">
            <JSONPath>$.a.id</JSONPath>
            <JSONPath>$.b.id</JSONPath>
        </Variable>
    </JSONPayload>
</ExtractVariables>`;

  const schema = getPolicySchema('ExtractVariables');
  const form = parsePolicyXml(xml, schema);
  assert.equal(form.fields.jsonVariables.items[0].values.length, 2);
  assert.equal(squash(buildPolicyXml('P1', form, schema, xml, new Set(['jsonVariables']))), squash(xml));
});

test('HTTPModifier is hand-written and edits its own lists', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<HTTPModifier continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Remove>
        <QueryParams>
            <QueryParam name="apikey"/>
        </QueryParams>
    </Remove>
</HTTPModifier>`;

  const schema = getPolicySchema('HTTPModifier');
  assert.ok(!schema.derived, 'HTTPModifier should be hand-written');

  const out = edit(xml, 'HTTPModifier', ['addHeaders'], (form) => {
    form.fields.addHeaders = { kind: 'kv-list', items: [{ name: 'X-Trace', value: '{messageid}' }] };
  });

  assert.match(out, /<Add>\s*<Headers>\s*<Header name="X-Trace">\{messageid\}<\/Header>/);
  assert.match(out, /<QueryParam name="apikey"\/>/, 'the existing Remove block must survive');
});

test('an edited element keeps its place in the document', () => {
  // AssignMessage executes Remove, Set and Add in the order they appear, so a
  // rewrite that appends instead of replacing in place changes behaviour — and
  // even where it doesn't, it turns a one-word edit into a shuffled diff.
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="P1">
    <DisplayName>P1</DisplayName>
    <Remove>
        <Headers>
            <Header name="X-Secret"/>
        </Headers>
    </Remove>
    <Set>
        <Headers>
            <Header name="X-Trace">old</Header>
        </Headers>
    </Set>
    <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
</AssignMessage>`;

  const out = edit(xml, 'AssignMessage', ['setHeaders'], (form) => {
    form.fields.setHeaders = { kind: 'kv-list', items: [{ name: 'X-Trace', value: 'new' }] };
  });

  const order = [...out.matchAll(/<(Remove|Set|IgnoreUnresolvedVariables)[\s>]/g)].map((m) => m[1]);
  assert.deepEqual(order, ['Remove', 'Set', 'IgnoreUnresolvedVariables'], 'Remove must still run before Set');
  assert.match(out, /<Header name="X-Trace">new<\/Header>/);
});

test('a derived schema declares what it cannot edit', () => {
  // DataCapture's <Capture> repeats with children, which no field type can
  // express. Saying so is the contract; quietly editing the first occurrence
  // would be the bug. (ExtractVariables used to be the example here, until it
  // got the hand-written repeating editors it deserved.)
  const schema = getPolicySchema('DataCapture');
  assert.ok(schema.derived);
  const notes = schema.sections.filter((s) => s.note).map((s) => s.note);
  assert.ok(notes.length, 'DataCapture should warn about <Capture>');
  assert.ok(notes.some((n) => n.includes('XML tab')), 'the note should point somewhere useful');
});

test('the schema only describes elements Apigee actually defines', () => {
  // Each of these was in POLICY_SCHEMAS once and is not in the policy
  // reference: CORS has GeneratePreflightResponse (not GenerateErrorResponse)
  // and takes a flow variable in AllowOrigins itself (no AllowOriginsRef);
  // VerifyJWT has IgnoreIssuedAt and TimeAllowance, not IgnoreExpiry; and
  // Quota's <Class> hangs off <Allow>, never off <Quota>.
  const paths = (type) =>
    getPolicySchema(type)
      .sections.flatMap((s) => s.fields)
      .map((f) => f.path.join('/'));

  assert.ok(!paths('CORS').includes('GenerateErrorResponse'));
  assert.ok(!paths('CORS').includes('AllowOriginsRef'));
  assert.ok(paths('CORS').includes('GeneratePreflightResponse'));
  assert.ok(!paths('VerifyJWT').includes('IgnoreExpiry'));
  assert.ok(!paths('Quota').includes('Class'));
  assert.ok(paths('Quota').includes('Allow/Class'));
});
