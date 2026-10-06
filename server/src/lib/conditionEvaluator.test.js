import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCondition } from './conditionEvaluator.js';

/**
 * The condition grammar, checked against the Apigee conditions reference
 * rather than against what we remember of it.
 *
 * Every case here is either quoted from, or directly derived from, that page:
 * https://cloud.google.com/apigee/docs/api-platform/reference/conditions-reference
 *
 * This file exists because the grammar is wide, almost all of it is optional
 * to get right until a proxy is deployed, and a wrong guess about one operator
 * is invisible until a flow silently stops matching in production. The first
 * version of this evaluator got `{name}` path elements, six operators and the
 * whole null-operand table wrong, and nothing caught it.
 */

const VARS = {
  'proxy.pathsuffix': '/pets/123',
  'request.verb': 'GET',
  'request.path': '/v1/pets/123',
  'response.status.code': '404',
  'request.header.help!me': 'yes',
  'flow.cachehit': 'true',
  'fault.name': 'InvalidApiKey',
};

/** Resolves against VARS; anything else is unset, as it would be at runtime. */
const resolve = (name) => VARS[name];

/** Asserts a condition is understood (not `unsupported`) and gives `expected`. */
function check(condition, expected, vars = resolve) {
  const out = evaluateCondition(condition, vars);
  assert.equal(out.unsupported, false, `should parse: ${condition}${out.error ? ` — ${out.error}` : ''}`);
  assert.equal(out.result, expected, `${condition} should be ${expected}`);
}

test('path expressions: * is one element, ** is one or many', () => {
  check('proxy.pathsuffix MatchesPath "/pets/*"', true);
  check('proxy.pathsuffix MatchesPath "/pets/**"', true);
  check('proxy.pathsuffix MatchesPath "/pets"', false);
  // "/*/a/**" matches "/x/a/b/c/d" — from the reference's own table.
  check('request.path MatchesPath "/*/pets/**"', true);
  // A single * does not span a separator.
  check('proxy.pathsuffix MatchesPath "/*"', false);
});

test('path expressions: {name} matches one element and is not a literal', () => {
  // "Curly braces {name} can also be used to match a single path element and
  // provide clarity to the reader."
  check('proxy.pathsuffix MatchesPath "/pets/{petId}"', true);
  check('request.path MatchesPath "/{version}/pets/{petId}"', true);
  // The name is for the reader only, so it never constrains the match.
  check('proxy.pathsuffix MatchesPath "/pets/{anythingAtAll}"', true);
  // ...and it is one element, not many.
  check('request.path MatchesPath "/{one}"', false);
});

test('path expressions: % escapes the next character', () => {
  // "The pattern %{user%} matches {user} but not user."
  const braces = (name) => ({ 'proxy.pathsuffix': '{user}' })[name];
  check('proxy.pathsuffix MatchesPath "%{user%}"', true, braces);
  check('proxy.pathsuffix MatchesPath "{user}"', true, braces);
  check('proxy.pathsuffix MatchesPath "%{user%}"', false, (n) => ({ 'proxy.pathsuffix': 'user' })[n]);
  // An escaped asterisk is an asterisk.
  check('proxy.pathsuffix MatchesPath "/pets/%*"', false);
});

test('Matches is a glob over the whole string, not a path expression', () => {
  // The walkthrough: "/*at" matches "/cat" — the wildcard is not path-aware.
  const suffix = (v) => (name) => ({ 'proxy.pathsuffix': v })[name];
  check('proxy.pathsuffix Matches "/*at"', true, suffix('/cat'));
  check('proxy.pathsuffix Matches "/*at"', true, suffix('/bat'));
  check('proxy.pathsuffix Matches "/owl"', false, suffix('/cat'));
  // Literal match with no wildcard at all.
  check('proxy.pathsuffix Matches "/cat"', true, suffix('/cat'));
  check('proxy.pathsuffix Matches "/cat"', false, suffix('/cat/paws'));
  // Its * spans separators, where MatchesPath's does not.
  check('proxy.pathsuffix Matches "/pets/*"', true);
  check('proxy.pathsuffix Matches "/*"', true);
});

test('JavaRegex anchors at both ends, as Pattern.matches does', () => {
  check('proxy.pathsuffix ~~ "/pets/[0-9]+"', true);
  check('proxy.pathsuffix ~~ "/pets"', false);
  check('proxy.pathsuffix JavaRegex "/pets/\\d+"', true);
});

test('every documented operator spelling is accepted', () => {
  const pairs = [
    ['request.verb = "GET"', true],
    ['request.verb == "GET"', true],
    ['request.verb Equals "GET"', true],
    ['request.verb Is "GET"', true],
    ['request.verb != "POST"', true],
    ['request.verb NotEquals "POST"', true],
    ['request.verb IsNot "POST"', true],
    ['request.verb := "get"', true],
    ['request.verb EqualsCaseInsensitive "get"', true],
    ['proxy.pathsuffix =| "/pets"', true],
    ['proxy.pathsuffix StartsWith "/pets"', true],
    ['proxy.pathsuffix StartsWith "/dogs"', false],
    ['proxy.pathsuffix ~/ "/pets/*"', true],
    ['proxy.pathsuffix LikePath "/pets/*"', true],
    ['proxy.pathsuffix ~ "/pets/*"', true],
    ['proxy.pathsuffix Like "/pets/*"', true],
    ['response.status.code > 400', true],
    ['response.status.code GreaterThan 400', true],
    ['response.status.code >= 404', true],
    ['response.status.code GreaterThanOrEquals 404', true],
    ['response.status.code < 500', true],
    ['response.status.code LesserThan 500', true],
    ['response.status.code <= 404', true],
    ['response.status.code LesserThanOrEquals 404', true],
    ['not (request.verb = "POST")', true],
    ['! (request.verb = "POST")', true],
  ];
  for (const [condition, expected] of pairs) check(condition, expected);
});

test('the HTML entity operator forms the Apigee UI writes', () => {
  // "If you use > when defining the condition in the Apigee UI, it is
  // converted to &gt;" and "The Apigee UI does not support the literal <".
  check('response.status.code &gt; 400', true);
  check('response.status.code &gt;= 404', true);
  check('response.status.code &lt; 500', true);
  check('response.status.code &lt;= 404', true);
});

test('operands are coerced to a common type before comparing', () => {
  // 'response.status.code = "400"' and '= 400' are equivalent per the docs.
  check('response.status.code = "404"', true);
  check('response.status.code = 404', true);
});

test('null, true and false are literals', () => {
  check('request.header.host is null', true);
  check('request.header.host is not null', false);
  check('fault.name is not null', true);
  check('flow.cachehit is true', true);
  check('request.header.nothing = null', true);
});

test('the null-operand table', () => {
  // LHS null, RHS null, both null — straight from the reference's table.
  const unset = 'request.header.absent';
  check(`${unset} = "x"`, false);
  check(`${unset} != "x"`, true);
  check(`${unset} = ${unset}`, true);
  check(`${unset} != ${unset}`, false);
  check(`${unset} =| "x"`, false);
  // `>` with a null LHS is true in Apigee and false in plain JavaScript.
  check(`${unset} > 5`, true);
  check(`${unset} >= 5`, false);
  check(`${unset} < 5`, true);
  check(`${unset} <= 5`, true);
  check(`${unset} ~ "x"`, false);
  check(`${unset} ~/ "x"`, false);
  check(`${unset} ~~ "x"`, false);
  // RHS null.
  check(`response.status.code > ${unset}`, false);
  check(`response.status.code >= ${unset}`, true);
});

test('single quotes name a variable holding an operator character', () => {
  // "To include an operator in a variable, a variable name must be enclosed in
  // single quotes. For example, 'request.header.help!me'."
  check(`'request.header.help!me' = "yes"`, true);
  check(`'request.header.help!me' = "no"`, false);
  // On the right, quotes of either kind are what people mean by a value.
  check(`request.verb = 'GET'`, true);
});

test('and binds tighter than or, as Java precedence requires', () => {
  // "Java precedence is used for operators."
  // false and false or true  ->  (false and false) or true  ->  true
  check('request.verb = "POST" and request.verb = "PUT" or request.verb = "GET"', true);
  // true or true and false  ->  true or (true and false)  ->  true
  check('request.verb = "GET" or request.verb = "GET" and request.verb = "POST"', true);
  // Parentheses still win.
  check('(request.verb = "GET" or request.verb = "POST") and response.status.code = 404', true);
});

test('an operator written without spaces still evaluates', () => {
  // The reference asks for spaces, then writes <Condition>request.verb="GET"</Condition>
  // in its own flow examples. Both have to work.
  check('request.verb="GET"', true);
  check('request.verb!="POST"', true);
  check('response.status.code>=404', true);
  check('(proxy.pathsuffix MatchesPath "/pets/*") and (request.verb="GET")', true);
});

test('a blank condition always matches', () => {
  check('', true);
  check('   ', true);
});

test('what it cannot parse is reported, never guessed', () => {
  for (const bad of ['request.verb = ', '(request.verb = "GET"', 'request.verb "GET"', 'and and']) {
    const out = evaluateCondition(bad, resolve);
    assert.equal(out.unsupported, true, `should be unsupported: ${bad}`);
    assert.equal(out.result, false);
  }
});
