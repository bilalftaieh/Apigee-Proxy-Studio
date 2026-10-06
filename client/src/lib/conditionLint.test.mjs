import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The condition checker, held against the Apigee conditions reference:
 * https://cloud.google.com/apigee/docs/api-platform/reference/conditions-reference
 *
 * Two halves, and the first matters more. A checker that misses a mistake is
 * merely not helping; one that reports a mistake in correct code is actively
 * wrong in the editor, and this one shipped with six rules' worth of that —
 * `{name}` path elements called an error and offered a rewrite, eight
 * operators missing, single-quoted names rejected. So VALID comes first and is
 * the part to extend when a new rule is added.
 *
 * Run with `npm run test:conditions` (see scripts/test-condition-lint.mjs,
 * which bundles the TypeScript and puts the module on globalThis).
 */
const { analyzeCondition, conditionTone, countBySeverity } = globalThis.__CONDITION_LINT__;

/** Anything louder than `info` on a valid condition is a bug. */
function assertQuiet(condition, why, opts) {
  const analysis = analyzeCondition(condition, opts);
  const loud = analysis.issues.filter((i) => i.severity === 'error' || i.severity === 'warning');
  assert.deepEqual(
    loud.map((i) => `${i.id}: ${i.message}`),
    [],
    `valid per the reference (${why}): ${condition}`
  );
  return analysis;
}

/** Asserts the named rule fires, and returns it so the fix can be checked. */
function assertFlags(condition, ruleId, opts) {
  const analysis = analyzeCondition(condition, opts);
  const hit = analysis.issues.find((i) => i.id === ruleId);
  assert.ok(hit, `expected ${ruleId} for: ${condition}\ngot: ${analysis.issues.map((i) => i.id).join(', ') || '(nothing)'}`);
  return hit;
}

// ---------------------------------------------------------------- valid input

test('path expressions are left alone', () => {
  // "Curly braces {name} can also be used to match a single path element and
  // provide clarity to the reader."
  assertQuiet('proxy.pathsuffix MatchesPath "/pets/{petId}"', 'braces name one path element');
  assertQuiet('proxy.pathsuffix MatchesPath "/a/{reader}/feed/"', "the reference's own table");
  assertQuiet('proxy.pathsuffix MatchesPath "%{user%}"', '% escapes a literal brace');
  assertQuiet('proxy.pathsuffix MatchesPath "/orders/**"', '** is one or many elements');
  assertQuiet('proxy.pathsuffix MatchesPath "**/feed"', 'a pattern may open with a wildcard');
});

test('every documented operator spelling is accepted', () => {
  const valid = [
    ['request.verb Is "GET"', 'Is is an alias for Equals'],
    ['request.verb IsNot "POST"', 'IsNot is an alias for NotEquals'],
    ['request.verb := "GET"', 'EqualsCaseInsensitive'],
    ['response.status.code LesserThan 500', 'Apigee spells it Lesser, not Less'],
    ['response.status.code LesserThanOrEquals 500', 'LesserThanOrEquals'],
    ['proxy.pathsuffix =| "/admin"', 'StartsWith, symbol form'],
    ['proxy.pathsuffix StartsWith "/admin"', 'StartsWith, word form'],
    ['proxy.pathsuffix LikePath "/a/*"', 'LikePath is an alias for MatchesPath'],
    ['proxy.pathsuffix ~/ "/a/*"', 'MatchesPath, symbol form'],
    ['request.content ~~ "^[0-9]+$"', 'JavaRegex'],
    ['request.header.host is null', 'the Literals section'],
    ['request.header.host is not null', 'negated presence check'],
    ['flow.cachehit is true', 'the Literals section'],
    ['response.status.code = 404', 'operands are coerced to a common type'],
    ['not (request.verb = "POST")', 'Not is a unary operator'],
  ];
  for (const [condition, why] of valid) assertQuiet(condition, why);
});

test('the HTML entity operators the Apigee UI writes', () => {
  // "If you use > when defining the condition in the Apigee UI, it is converted
  // to &gt;" and "The Apigee UI does not support the literal <". Every proxy
  // imported from a console-edited bundle arrives carrying these.
  for (const op of ['&gt;', '&gt;=', '&lt;', '&lt;=']) {
    assertQuiet(`response.status.code ${op} 400`, 'the UI writes entity forms');
  }
});

test('single quotes wrap a variable name, not a value', () => {
  // "To include an operator in a variable, a variable name must be enclosed in
  // single quotes. For example, 'request.header.help!me'."
  assertQuiet(`'request.header.help!me' = "yes"`, 'a name holding an operator');
  // Nothing useful can be said about a single-quoted token, so nothing is.
  assertQuiet(`request.verb = 'GET'`, 'ambiguous by construction — stay quiet');
});

test('a real-world condition reads clean end to end', () => {
  const analysis = assertQuiet(
    '(proxy.pathsuffix MatchesPath "/pets/{petId}") and (request.verb = "GET")',
    'both halves are documented'
  );
  assert.equal(analysis.path, '/pets/{petId}');
  assert.equal(analysis.verb, 'GET');
  assert.equal(analysis.pathOperator, 'MatchesPath');
  assert.equal(conditionTone(analysis), undefined);
});

// -------------------------------------------------------------- real mistakes

test('a verb that can never match', () => {
  assert.equal(assertFlags('request.verb = "get"', 'verb-case').fix.condition, 'request.verb = "GET"');
  assert.equal(assertFlags('request.verb = GET', 'verb-unquoted').fix.condition, 'request.verb = "GET"');
  assert.equal(assertFlags('request.verb = " GET "', 'verb-padding').fix.condition, 'request.verb = "GET"');
  assert.equal(assertFlags('request.verb = "PSOT"', 'verb-unknown').fix.condition, 'request.verb = "POST"');
});

test('a path that can never match', () => {
  // Equals is literal, so a wildcard or a {name} in it is a dead condition.
  assert.equal(
    assertFlags('proxy.pathsuffix = "/users/*"', 'path-equals-wildcard').fix.condition,
    'proxy.pathsuffix MatchesPath "/users/*"'
  );
  assertFlags('proxy.pathsuffix Equals "/pets/{petId}"', 'path-equals-wildcard');
  // ...but an escaped one is a literal on purpose.
  assertQuiet('proxy.pathsuffix = "/users/%*"', 'the asterisk is escaped');

  assert.equal(
    assertFlags('proxy.pathsuffix MatchesPath "users/*"', 'path-no-slash').fix.condition,
    'proxy.pathsuffix MatchesPath "/users/*"'
  );
  assert.equal(
    assertFlags('proxy.pathsuffix MatchesPath "/users?active=1"', 'path-query').fix.condition,
    'proxy.pathsuffix MatchesPath "/users"'
  );
});

test('the wrong path variable', () => {
  assert.equal(
    assertFlags('request.uri MatchesPath "/v1/users/*"', 'path-var-uri').fix.condition,
    'proxy.pathsuffix MatchesPath "/v1/users/*"'
  );
  assertFlags('request.path MatchesPath "/users/*"', 'path-var-basepath', { basePath: '/v1' });
  // With a matching base path there is nothing to say.
  assertQuiet('request.path MatchesPath "/v1/users/*"', 'the pattern includes the base path', { basePath: '/v1' });
});

test('a variable name that is a near-miss for a built-in', () => {
  assert.equal(assertFlags('request.method = "POST"', 'var-unknown').fix.condition, 'request.verb = "POST"');
  assert.equal(assertFlags('response.status = 404', 'var-unknown').fix.condition, 'response.status.code = 404');
  assertFlags('proxy.pathsufix MatchesPath "/a"', 'var-unknown');
  assertFlags('request.headers.authorization is not null', 'var-unknown');
});

test('a variable this proxy made is not a near-miss', () => {
  // The useful variables in a real proxy come from its own policies, so an
  // unrecognised name has to stay quiet or the checker is noise.
  assertQuiet('verifyapikey.VK-Key.apiproduct.name = "gold"', 'set by a VerifyAPIKey policy');
  assertQuiet('ratelimit.Quota-1.exceed.count > 0', 'set by a Quota policy');
  assertQuiet('myco.custom.thing = "x"', 'set by an AssignMessage policy');
});

test('operators written without their spaces', () => {
  // The reference asks for spaces and then omits them in its own examples, so
  // this is advice, not an error — and the condition still has to be read.
  const issue = assertFlags('request.verb="GET"', 'operator-no-space');
  assert.equal(issue.severity, 'warning');
  assert.equal(issue.fix.condition, 'request.verb = "GET"');
  assert.equal(analyzeCondition('request.verb="GET"').verb, 'GET', 'still detected');

  // The fix must not reach inside string literals to collapse whitespace.
  assert.equal(
    assertFlags('request.header.x="a  b"', 'operator-no-space').fix.condition,
    'request.header.x = "a  b"'
  );
});

test('syntax it cannot read, reported once and precisely', () => {
  const cases = [
    ['(proxy.pathsuffix MatchesPath "/a"', /never closed/],
    ['proxy.pathsuffix MatchesPath "/a', /never closed/],
    ['proxy.pathsuffix MatchesPath "/a" and', /stops after/],
    ['request.verb === "GET"', /not an Apigee operator/],
  ];
  for (const [condition, pattern] of cases) {
    const analysis = analyzeCondition(condition);
    assert.equal(analysis.parseError, true, `should not parse: ${condition}`);
    assert.equal(analysis.issues.length, 1, `one message, not a cascade: ${condition}`);
    assert.match(analysis.issues[0].message, pattern);
  }
  // A known typo keeps its suggestion rather than being split into two tokens.
  assert.equal(analyzeCondition('request.verb === "GET"').issues[0].fix.condition, 'request.verb = "GET"');
});

// ------------------------------------------------------------------ detection

test('the path and verb are read back out', () => {
  const simple = analyzeCondition('(proxy.pathsuffix MatchesPath "/users/*") and (request.verb = "GET")');
  assert.equal(simple.simpleEquivalent, true);
  assert.deepEqual([simple.verb, simple.path], ['GET', '/users/*']);

  // An `or`, or an extra term, is more than the Path / Verb builder can hold.
  for (const condition of [
    '(proxy.pathsuffix MatchesPath "/a") or (proxy.pathsuffix MatchesPath "/b")',
    '(proxy.pathsuffix MatchesPath "/a/*") and (request.header.x-key is not null)',
    '(proxy.pathsuffix MatchesPath "/a") and (proxy.pathsuffix MatchesPath "/b")',
  ]) {
    assert.equal(analyzeCondition(condition).simpleEquivalent, false, condition);
  }

  // Detection still reports what it can from a condition it cannot simplify.
  const mixed = analyzeCondition('(proxy.pathsuffix MatchesPath "/a/*") and (request.verb = "GET") and (foo.bar = "1")');
  assert.deepEqual([mixed.verb, mixed.path, mixed.extras.length], ['GET', '/a/*', 1]);

  // `Matches` is not MatchesPath and must not be quietly folded into it.
  assert.equal(analyzeCondition('proxy.pathsuffix Matches "/a/*"').simpleEquivalent, false);
});

test('an empty condition has nothing to report', () => {
  for (const blank of ['', '   ', null, undefined]) {
    const analysis = analyzeCondition(blank);
    assert.deepEqual(analysis.issues, []);
    assert.equal(analysis.simpleEquivalent, false);
  }
});

test('severity rolls up for the editor', () => {
  assert.equal(conditionTone(analyzeCondition('request.verb = "get"')), 'error');
  assert.equal(conditionTone(analyzeCondition('request.method = "POST"')), 'warning');
  assert.equal(conditionTone(analyzeCondition('request.verb = "GET"')), undefined);
  assert.deepEqual(countBySeverity(analyzeCondition('request.verb = "get"').issues), { errors: 1, warnings: 0 });
});
