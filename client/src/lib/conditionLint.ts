/**
 * Reads an Apigee condition the way Apigee will, and says what it found.
 *
 * Custom conditions are typed by hand into a one-line input and nothing checks
 * them until a deploy fails — or worse, until the deploy succeeds and the flow
 * silently never matches. Apigee has no lint for this: `request.verb = "get"`
 * is a perfectly valid condition that simply cannot be true, and
 * `proxy.pathsuffix MatchesPath "/pets/{petId}"` is valid too, and matches a
 * request for those eight literal characters.
 *
 * So this parses the condition (the same grammar subset as the server's
 * conditionEvaluator, which is what the test simulator runs) and reports two
 * things:
 *
 *   - `issues` — what looks wrong, each with the span it is about and, where
 *     there is only one sensible reading, the rewritten condition to apply.
 *   - the path and verb it detected, so the editor can say what the condition
 *     matches without the reader parsing the string in their head — and can
 *     offer a path/verb-shaped condition back to the builder.
 *
 * Deliberately quiet about variables it does not recognise: most of the useful
 * ones in a real proxy are created by that proxy's own policies, so an unknown
 * name is only reported when it is a near-miss for a built-in one.
 */

import { APIGEE_FLOW_VARIABLES } from './flowVariables';

export type ConditionSeverity = 'error' | 'warning' | 'info';

export interface ConditionFix {
  label: string;
  /** The entire condition, rewritten — not a patch. */
  condition: string;
}

export interface ConditionIssue {
  /** Stable rule id, so the UI can special-case a few (see ConditionCheck). */
  id: string;
  severity: ConditionSeverity;
  message: string;
  /** Offsets into the condition string: the span the message is about. */
  start: number;
  end: number;
  fix?: ConditionFix;
}

export type DetectedPathOperator = 'MatchesPath' | 'Matches' | 'Equals';

export interface ConditionAnalysis {
  issues: ConditionIssue[];
  /** The verb this condition tests for, if it tests one. */
  verb: string | null;
  /** The path pattern it tests against, if it tests one. */
  path: string | null;
  pathOperator: DetectedPathOperator | null;
  /** Everything that is neither the path nor the verb, quoted as written. */
  extras: string[];
  /**
   * The whole condition is a path test, a verb test, or the two ANDed — so the
   * Path / Verb builder can hold it without dropping anything.
   */
  simpleEquivalent: boolean;
  /** The condition could not be parsed; `issues` holds the one syntax error. */
  parseError: boolean;
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'];
const HTTP_METHOD_SET = new Set(HTTP_METHODS);

/** Variables that hold the request method. */
const VERB_VARS = new Set(['request.verb', 'message.verb']);
/** The one path variable a conditional flow should be matching on. */
const PATHSUFFIX = 'proxy.pathsuffix';
/** Path-ish variables that are *not* the path suffix, and differ in known ways. */
const WIDER_PATH_VARS = new Set(['request.path', 'request.uri', 'message.path', 'message.uri', 'proxy.url', 'request.url']);

// ---------------------------------------------------------------- tokenizer

interface TokBase {
  start: number;
  end: number;
  text: string;
}
/**
 * What can stand on either side of a comparison: never a parenthesis.
 *
 * `quoted` marks a name that arrived in single quotes. Those are not a second
 * spelling of a string literal — the reference is explicit that "to include an
 * operator in a variable, a variable name must be enclosed in single quotes",
 * as in `'request.header.help!me'` — so they tokenize as identifiers. Since
 * plenty of hand-written conditions use them for values anyway, every rule
 * that would judge the text one way or the other skips them.
 */
type ValueTok =
  | (TokBase & { type: 'string'; value: string; quote: string })
  | (TokBase & { type: 'word'; quoted?: boolean; glued?: boolean });
type Tok = (TokBase & { type: 'paren' }) | ValueTok;

class ConditionParseError extends Error {
  start: number;
  end: number;
  fix?: ConditionFix;
  constructor(message: string, start: number, end: number, fix?: ConditionFix) {
    super(message);
    this.start = start;
    this.end = end;
    this.fix = fix;
  }
}

/**
 * Symbol operators, longest first so `>=` is never read as `>` then `=`. The
 * HTML entities are in here for the same reason they are in OPERATORS: the
 * Apigee UI writes them.
 */
const SYMBOL_OPERATORS = ['&gt;=', '&lt;=', '&gt;', '&lt;', '!=', '!~', ':=', '==', '>=', '<=', '=|', '~~', '~/', '=', '<', '>', '~', '!'];

/**
 * `request.verb="GET"` — an operator with no space around it.
 *
 * The reference says "a space character is required before and after an
 * operator", but the same docs write `<Condition>request.verb="GET"</Condition>`
 * in their own flow examples, and real bundles are full of it. Rejecting it
 * outright would cost every one of those conditions its reading as well as its
 * check, so the run is split back into its three tokens here and the spacing
 * is reported afterwards as a warning on the operator — `glued` marks it.
 *
 * A name that genuinely contains an operator character has to be single-quoted
 * to be legal at all, and those never reach this function.
 */
function splitGluedOperator(raw: string, offset: number): Tok[] {
  const whole = [{ type: 'word', text: raw, start: offset, end: offset + raw.length } as Tok];
  // A run that is already exactly an operator is spaced correctly and must be
  // left alone — `~~` would otherwise come apart into two `~`, and `&lt;=`
  // into `&lt;` and `=`.
  // A known typo is left whole too, so the parser can name it (`===`) instead
  // of the splitter quietly turning it into `==` followed by a stray `=`.
  if (OPERATORS[raw.toLowerCase()] || OPERATOR_TYPOS[raw.toLowerCase()]) return whole;

  for (let pos = 0; pos < raw.length; pos++) {
    const op = SYMBOL_OPERATORS.find((candidate) => raw.startsWith(candidate, pos));
    if (!op) continue;
    const rest = raw.slice(pos + op.length);
    // Nothing on either side means the run is an operator after all.
    if (pos === 0 && !rest) return whole;
    const tokens: Tok[] = [];
    if (pos > 0) tokens.push({ type: 'word', text: raw.slice(0, pos), start: offset, end: offset + pos });
    tokens.push({ type: 'word', text: op, glued: pos > 0 || undefined, start: offset + pos, end: offset + pos + op.length });
    // The tail can hold another: `a=b=c` is nobody's intent, but it should
    // come apart completely rather than halfway.
    if (rest) tokens.push(...splitGluedOperator(rest, offset + pos + op.length));
    return tokens;
  }
  return whole;
}

function tokenize(input: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', text: ch, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < input.length && input[j] !== ch) j++;
      if (j >= input.length) {
        throw new ConditionParseError(
          `This ${ch === '"' ? 'double' : 'single'} quote is never closed — what it opens runs to the end of the condition.`,
          i,
          input.length
        );
      }
      const inner = input.slice(i + 1, j);
      tokens.push(
        ch === '"'
          ? { type: 'string', text: input.slice(i, j + 1), value: inner, quote: ch, start: i, end: j + 1 }
          : { type: 'word', text: inner, quoted: true, start: i, end: j + 1 }
      );
      i = j + 1;
      continue;
    }
    // One run of everything else: identifiers (proxy.pathsuffix), keywords
    // (and/or/not) and symbol operators (=, !=, ~~) are not told apart here —
    // except that a run with an operator buried in it is pulled back apart.
    let j = i;
    while (j < input.length && !/[\s()"']/.test(input[j])) j++;
    for (const tok of splitGluedOperator(input.slice(i, j), i)) tokens.push(tok);
    i = j;
  }
  return tokens;
}

// ------------------------------------------------------------------- parser

const AND_WORDS = new Set(['and', '&&']);
const OR_WORDS = new Set(['or', '||']);
const NOT_WORDS = new Set(['not', '!']);

/**
 * Every spelling of every operator in the conditions reference, mapped to one
 * canonical name. Both the symbol and the word form are valid, and the word
 * forms are matched case-insensitively.
 *
 * The HTML entity forms are not a nicety: the reference says the Apigee UI
 * converts `>` to `&gt;` when you save a condition, and that it "does not
 * support the literal <" at all. Any proxy imported from a console-edited
 * bundle therefore arrives with them, so a parser that rejects them rejects
 * real, deployed conditions.
 */
const OPERATORS: Record<string, string> = {
  '=': 'Equals',
  '==': 'Equals',
  equals: 'Equals',
  is: 'Equals',
  ':=': 'EqualsCaseInsensitive',
  equalscaseinsensitive: 'EqualsCaseInsensitive',
  '!=': 'NotEquals',
  notequals: 'NotEquals',
  isnot: 'NotEquals',
  '~~': 'JavaRegex',
  javaregex: 'JavaRegex',
  '~/': 'MatchesPath',
  matchespath: 'MatchesPath',
  likepath: 'MatchesPath',
  '~': 'Matches',
  matches: 'Matches',
  like: 'Matches',
  '!~': 'NotMatches',
  '=|': 'StartsWith',
  startswith: 'StartsWith',
  '>': 'GreaterThan',
  '&gt;': 'GreaterThan',
  greaterthan: 'GreaterThan',
  '>=': 'GreaterThanOrEquals',
  '&gt;=': 'GreaterThanOrEquals',
  greaterthanorequals: 'GreaterThanOrEquals',
  '<': 'LesserThan',
  '&lt;': 'LesserThan',
  lesserthan: 'LesserThan',
  '<=': 'LesserThanOrEquals',
  '&lt;=': 'LesserThanOrEquals',
  lesserthanorequals: 'LesserThanOrEquals',
};

/**
 * Near-misses, with the spelling Apigee actually wants. `LessThan` earns its
 * place here: it is what every other language calls the operator, and Apigee
 * is the one that spells it `LesserThan`.
 */
const OPERATOR_TYPOS: Record<string, string> = {
  '===': '=',
  '!==': '!=',
  '<>': '!=',
  '=~': '~~',
  contains: '~~',
  matchpath: 'MatchesPath',
  matchespaths: 'MatchesPath',
  regex: '~~',
  eq: '=',
  ne: '!=',
  lessthan: 'LesserThan',
  lessthanorequals: 'LesserThanOrEquals',
  lt: 'LesserThan',
  gt: 'GreaterThan',
  beginswith: 'StartsWith',
  endswith: '~',
};

type Node =
  | { kind: 'and' | 'or'; left: Node; right: Node; start: number; end: number }
  | { kind: 'not'; node: Node; start: number; end: number }
  | { kind: 'compare'; op: string; opTok: Tok; left: ValueTok; right?: ValueTok; start: number; end: number }
  | { kind: 'truthy'; ident: Tok; start: number; end: number };

function parse(tokens: Tok[], src: string): Node {
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const word = (tok: Tok | undefined) => (tok && tok.type === 'word' ? tok.text.toLowerCase() : null);

  function parseOr(): Node {
    let node = parseAnd();
    while (OR_WORDS.has(word(peek()) as string)) {
      next();
      const right = parseAnd();
      node = { kind: 'or', left: node, right, start: node.start, end: right.end };
    }
    return node;
  }

  function parseAnd(): Node {
    let node = parseUnary();
    while (AND_WORDS.has(word(peek()) as string)) {
      next();
      const right = parseUnary();
      node = { kind: 'and', left: node, right, start: node.start, end: right.end };
    }
    return node;
  }

  function parseUnary(): Node {
    if (NOT_WORDS.has(word(peek()) as string)) {
      const op = next();
      const node = parseUnary();
      return { kind: 'not', node, start: op.start, end: node.end };
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const tok = peek();
    if (tok && tok.type === 'paren' && tok.text === '(') {
      const open = next();
      const node = parseOr();
      const close = peek();
      if (!close || close.type !== 'paren' || close.text !== ')') {
        throw new ConditionParseError('This "(" is never closed.', open.start, node.end);
      }
      next();
      return { ...node, start: open.start, end: close.end };
    }
    if (!tok) {
      const last = tokens[tokens.length - 1];
      throw new ConditionParseError(
        last
          ? `The condition stops after "${last.text}" — the rest of the comparison is missing.`
          : 'Nothing to check here yet.',
        last ? last.start : 0,
        src.length
      );
    }
    if (tok.type === 'paren') {
      throw new ConditionParseError('This ")" closes something that was never opened.', tok.start, tok.end);
    }
    if (tok.type === 'string') {
      throw new ConditionParseError(
        `A quoted value cannot stand on its own — ${tok.text} needs a variable and an operator in front of it, as in proxy.pathsuffix MatchesPath ${tok.text}.`,
        tok.start,
        tok.end
      );
    }

    // `tok` is narrowed to a word by the three throws above; `next()` only
    // advances past it.
    const ident = tok;
    next();
    const opTok = peek();
    const opWord = word(opTok);

    if (opWord && OPERATORS[opWord]) {
      const op = next();
      let opName = OPERATORS[opWord];
      /* `x is not null`. `Is` is an alias for Equals and `Not` is the unary
         operator, so this is Equals-then-negate; folding it into NotEquals is
         both what it means and what `IsNot` spells directly. Written out
         because `is null` / `is not null` is how the docs' own Literals
         section phrases a presence check, and it is what people type. */
      if (opName === 'Equals' && word(peek()) === 'not') {
        next();
        opName = 'NotEquals';
      }
      const rhs = peek();
      // A parenthesis can't be a value, so it's the same mistake as running
      // out of tokens: the comparison was left half-written.
      if (!rhs || rhs.type === 'paren') {
        throw new ConditionParseError(`Nothing to compare against — "${op.text}" needs a value after it.`, op.start, op.end);
      }
      next();
      return { kind: 'compare', op: opName, opTok: op, left: ident, right: rhs, start: ident.start, end: rhs.end };
    }


    // A word that is neither an operator nor a connective can only be a
    // mistyped operator — saying so here reads far better than letting the top
    // level complain about an unexpected token three tokens further on.
    if (opTok && opTok.type === 'word' && opWord && !AND_WORDS.has(opWord) && !OR_WORDS.has(opWord)) {
      const suggestion = OPERATOR_TYPOS[opWord];
      throw new ConditionParseError(
        suggestion
          ? `"${opTok.text}" is not an Apigee operator — the one you want is "${suggestion}".`
          : `"${opTok.text}" is not an Apigee operator. Use =, !=, MatchesPath, Matches, ~~ (regex) or a comparison like >=.`,
        opTok.start,
        opTok.end,
        suggestion ? { label: `Use "${suggestion}"`, condition: replaceRange(src, opTok.start, opTok.end, suggestion) } : undefined
      );
    }

    return { kind: 'truthy', ident, start: ident.start, end: ident.end };
  }

  const node = parseOr();
  if (pos < tokens.length) {
    const stray = tokens[pos];
    throw new ConditionParseError(
      `"${stray.text}" is left over — the condition already ended before it. A missing "and" or "or" is the usual cause.`,
      stray.start,
      stray.end
    );
  }
  return node;
}

// ------------------------------------------------------------------ helpers

function replaceRange(src: string, start: number, end: number, text: string): string {
  return src.slice(0, start) + text + src.slice(end);
}

/** Levenshtein, bailing early — only ever run against ~70 short names. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const row = [i];
    for (let j = 1; j <= n; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[n];
}

/** Built-in names, with the `{name}` ones split off as prefixes. */
const KNOWN_VARS: string[] = [];
const KNOWN_PREFIXES: string[] = [];
for (const v of APIGEE_FLOW_VARIABLES) {
  if (v.name.includes('{')) KNOWN_PREFIXES.push(v.name.slice(0, v.name.indexOf('{')).toLowerCase());
  else KNOWN_VARS.push(v.name);
}
const KNOWN_LOWER = new Set(KNOWN_VARS.map((n) => n.toLowerCase()));
/** Punctuation and case stripped, to catch `proxy.pathSuffix` and `proxypathsuffix`. */
const KNOWN_SQUASHED = new Map(KNOWN_VARS.map((n) => [n.toLowerCase().replace(/[^a-z0-9]/g, ''), n]));

/** Wrong names that are wrong in a specific, repeatable way. */
const VAR_ALIASES: Record<string, string> = {
  'request.method': 'request.verb',
  'request.httpverb': 'request.verb',
  'request.http.verb': 'request.verb',
  'message.method': 'message.verb',
  'request.pathsuffix': 'proxy.pathsuffix',
  'proxy.path.suffix': 'proxy.pathsuffix',
  'response.status': 'response.status.code',
  'response.statuscode': 'response.status.code',
  'response.code': 'response.status.code',
  'request.body': 'request.content',
  'response.body': 'response.content',
  'request.query': 'request.querystring',
};

function isKnownVar(name: string): boolean {
  const lower = name.toLowerCase();
  if (KNOWN_LOWER.has(lower)) return true;
  return KNOWN_PREFIXES.some((p) => lower.startsWith(p) && lower.length > p.length);
}

/**
 * The canonical spelling of a mistyped built-in, or null when the name is fine
 * — or is simply one this proxy's own policies created, which is the common
 * case and must stay silent.
 */
function canonicalVar(name: string): string | null {
  if (isKnownVar(name)) return null;
  const lower = name.toLowerCase();

  if (VAR_ALIASES[lower]) return VAR_ALIASES[lower];

  // `request.headers.foo` / `request.queryparams.foo`: the plural forms are
  // real, but only as `.names` — reading one header through them gets nothing.
  const plural = lower.match(/^((?:request|response|message)\.)(headers|queryparams|formparams)\.(.+)$/);
  if (plural && plural[3] !== 'names') {
    return `${plural[1]}${plural[2].replace(/s$/, '')}.${name.slice(name.length - plural[3].length)}`;
  }

  const squashed = KNOWN_SQUASHED.get(lower.replace(/[^a-z0-9]/g, ''));
  if (squashed) return squashed;

  // Long enough that a one- or two-character difference is a typo rather than
  // a different name that happens to look similar.
  if (lower.length >= 8) {
    let best: string | null = null;
    let bestScore = 3;
    for (const known of KNOWN_VARS) {
      const d = editDistance(lower, known.toLowerCase());
      if (d < bestScore) {
        bestScore = d;
        best = known;
      }
    }
    if (best) return best;
  }
  return null;
}

/** Bare words that are values, not variable references. */
function isLiteralWord(text: string): boolean {
  if (/^-?\d+(\.\d+)?$/.test(text)) return true;
  const lower = text.toLowerCase();
  return lower === 'true' || lower === 'false' || lower === 'null';
}

function closestMethod(value: string): string | null {
  const upper = value.toUpperCase();
  let best: string | null = null;
  let bestScore = 3;
  for (const m of HTTP_METHODS) {
    const d = editDistance(upper, m);
    if (d < bestScore) {
      bestScore = d;
      best = m;
    }
  }
  return best;
}

// -------------------------------------------------------------------- rules

interface RuleContext {
  src: string;
  basePath?: string;
  issues: ConditionIssue[];
}

function checkVerbCompare(node: Extract<Node, { kind: 'compare' }>, ctx: RuleContext) {
  const { src } = ctx;
  const right = node.right;

  if (node.op !== 'Equals' && node.op !== 'NotEquals' && node.op !== 'EqualsCaseInsensitive') {
    ctx.issues.push({
      id: 'verb-operator',
      severity: 'warning',
      message: `${node.left.text} holds a plain word like GET, so "${node.opTok.text}" is doing pattern work it does not need. "=" is what this wants.`,
      start: node.opTok.start,
      end: node.opTok.end,
      fix: { label: 'Use "="', condition: replaceRange(src, node.opTok.start, node.opTok.end, '=') },
    });
    return;
  }
  if (!right) return;

  if (right.type === 'word') {
    if (isLiteralWord(right.text) || right.quoted) return;
    if (HTTP_METHOD_SET.has(right.text.toUpperCase())) {
      ctx.issues.push({
        id: 'verb-unquoted',
        severity: 'error',
        message: `${right.text} has no quotes, so Apigee reads it as the name of another variable rather than the literal verb. That variable does not exist, so this never matches.`,
        start: right.start,
        end: right.end,
        fix: {
          label: `Quote it as "${right.text.toUpperCase()}"`,
          condition: replaceRange(src, right.start, right.end, `"${right.text.toUpperCase()}"`),
        },
      });
    }
    return;
  }

  const value = right.value;
  const trimmed = value.trim();

  if (trimmed !== value) {
    ctx.issues.push({
      id: 'verb-padding',
      severity: 'error',
      message: `There is a space inside the quotes. Apigee compares the whole string, so "${value}" never equals ${trimmed.toUpperCase() || 'a verb'}.`,
      start: right.start,
      end: right.end,
      fix: {
        label: 'Trim the spaces',
        condition: replaceRange(src, right.start, right.end, `"${trimmed}"`),
      },
    });
    return;
  }

  if (!trimmed) {
    ctx.issues.push({
      id: 'verb-empty',
      severity: 'error',
      message: 'An empty verb never matches — every request carries one.',
      start: right.start,
      end: right.end,
    });
    return;
  }

  if (HTTP_METHOD_SET.has(trimmed.toUpperCase())) {
    if (trimmed !== trimmed.toUpperCase()) {
      ctx.issues.push({
        id: 'verb-case',
        severity: 'error',
        message: `${node.left.text} is always uppercase and Apigee compares it literally, so "${trimmed}" never matches a ${trimmed.toUpperCase()} request.`,
        start: right.start,
        end: right.end,
        fix: {
          label: `Use "${trimmed.toUpperCase()}"`,
          condition: replaceRange(src, right.start, right.end, `"${trimmed.toUpperCase()}"`),
        },
      });
    }
    return;
  }

  const near = closestMethod(trimmed);
  ctx.issues.push({
    id: 'verb-unknown',
    severity: 'warning',
    message: near
      ? `"${trimmed}" is not an HTTP method — did you mean ${near}?`
      : `"${trimmed}" is not an HTTP method, so no request will ever carry it.`,
    start: right.start,
    end: right.end,
    fix: near
      ? { label: `Use "${near}"`, condition: replaceRange(src, right.start, right.end, `"${near}"`) }
      : undefined,
  });
}

function checkPathCompare(node: Extract<Node, { kind: 'compare' }>, ctx: RuleContext) {
  const { src } = ctx;
  const right = node.right;
  const lname = node.left.text.toLowerCase();
  const isSuffix = lname === PATHSUFFIX;

  // The other path variables are all longer than the path suffix in some way,
  // and a pattern written for the suffix silently fails against them.
  if (!isSuffix) {
    if (lname === 'request.uri' || lname === 'message.uri' || lname === 'proxy.url' || lname === 'request.url') {
      ctx.issues.push({
        id: 'path-var-uri',
        severity: 'warning',
        message: `${node.left.text} carries the base path and the query string too, so a pattern written for the route alone stops matching the moment a caller adds ?foo=1. proxy.pathsuffix is this same path with both already stripped off.`,
        start: node.left.start,
        end: node.left.end,
        fix: { label: 'Match on proxy.pathsuffix', condition: replaceRange(src, node.left.start, node.left.end, PATHSUFFIX) },
      });
    } else if (right && right.type === 'string' && ctx.basePath && ctx.basePath !== '/' && !right.value.startsWith(ctx.basePath)) {
      ctx.issues.push({
        id: 'path-var-basepath',
        severity: 'warning',
        message: `${node.left.text} includes this proxy's base path, so to match anything the pattern would have to start with ${ctx.basePath}. proxy.pathsuffix is the same path with the base path already removed.`,
        start: node.left.start,
        end: node.left.end,
        fix: { label: 'Match on proxy.pathsuffix', condition: replaceRange(src, node.left.start, node.left.end, PATHSUFFIX) },
      });
    }
  }

  if (!right || right.type !== 'string') {
    if (right && right.type === 'word' && !right.quoted && !isLiteralWord(right.text) && right.text.startsWith('/')) {
      ctx.issues.push({
        id: 'path-unquoted',
        severity: 'error',
        message: `${right.text} has no quotes, so Apigee reads it as a variable name instead of a path.`,
        start: right.start,
        end: right.end,
        fix: { label: 'Add quotes', condition: replaceRange(src, right.start, right.end, `"${right.text}"`) },
      });
    }
    return;
  }

  const value = right.value;

  /* No rule about `{name}` here, deliberately. A path expression may use `*`
     for one element, `**` for many, and `{name}` for one element named only
     for the reader — "the variable name is only used for clarity and does not
     populate the matched value in a flow variable". So `/pets/{petId}` is
     correct Apigee and matches `/pets/123`; an earlier version of this file
     called it an error and offered to rewrite it, which was wrong twice over.
     `%` escapes the braces, so `%{user%}` matches a literal `{user}`. */

  /* Wildcards and `{name}` placeholders only mean anything to the pattern
     operators; Equals compares the path character for character. Unescaped
     only — `%*` and `%{` are literal characters by intent. */
  const literalOp = node.op === 'Equals' || node.op === 'NotEquals' || node.op === 'EqualsCaseInsensitive';
  const wildcard = value.match(/(?:^|[^%])(\*|\{[^/{}]*\})/);
  if (literalOp && wildcard) {
    const token = wildcard[1];
    ctx.issues.push({
      id: 'path-equals-wildcard',
      severity: 'error',
      message: `"${node.opTok.text}" compares the path character for character, so this only matches a request whose path is literally ${value} — ${token} included. MatchesPath is the operator that reads ${token} as a wildcard.`,
      start: node.opTok.start,
      end: node.opTok.end,
      fix: { label: 'Use MatchesPath', condition: replaceRange(src, node.opTok.start, node.opTok.end, 'MatchesPath') },
    });
  }

  if (isSuffix && value && !/^[/*{%]/.test(value)) {
    ctx.issues.push({
      id: 'path-no-slash',
      severity: 'warning',
      message: `proxy.pathsuffix always starts with "/", so a pattern starting with "${value[0]}" cannot match. Did you mean /${value}?`,
      start: right.start,
      end: right.end,
      fix: {
        label: `Use "/${value}"`,
        condition: replaceRange(src, right.start, right.end, `"/${value}"`),
      },
    });
  }

  if (isSuffix && value.includes('?')) {
    const path = value.slice(0, value.indexOf('?'));
    ctx.issues.push({
      id: 'path-query',
      severity: 'warning',
      message:
        'The path suffix stops before the "?" — the query string is not part of it. Match the route here, and test the parameter separately with request.queryparam.<name>.',
      start: right.start,
      end: right.end,
      fix: {
        label: 'Drop the query string',
        condition: replaceRange(src, right.start, right.end, `"${path}"`),
      },
    });
  }
}

function checkVariableName(tok: Tok, ctx: RuleContext) {
  // A single-quoted name is quoted precisely because it holds characters the
  // grammar would otherwise read as operators, so it will never match a
  // built-in and there is nothing useful to say about it.
  if (tok.type !== 'word' || tok.quoted || isLiteralWord(tok.text)) return;
  const canonical = canonicalVar(tok.text);
  if (!canonical) return;
  ctx.issues.push({
    id: 'var-unknown',
    severity: 'warning',
    message: `Apigee has no variable called ${tok.text} — it resolves to nothing, so this comparison quietly fails instead of erroring. Did you mean ${canonical}?`,
    start: tok.start,
    end: tok.end,
    fix: { label: `Use ${canonical}`, condition: replaceRange(ctx.src, tok.start, tok.end, canonical) },
  });
}

function walk(node: Node, ctx: RuleContext) {
  switch (node.kind) {
    case 'and':
    case 'or':
      walk(node.left, ctx);
      walk(node.right, ctx);
      return;
    case 'not':
      walk(node.node, ctx);
      return;
    case 'truthy':
      checkVariableName(node.ident, ctx);
      return;
    case 'compare': {
      const lname = node.left.text.toLowerCase();
      if (VERB_VARS.has(lname)) checkVerbCompare(node, ctx);
      else if (lname === PATHSUFFIX || WIDER_PATH_VARS.has(lname)) checkPathCompare(node, ctx);
      else checkVariableName(node.left, ctx);
      if (node.right && node.right.type === 'word') checkVariableName(node.right, ctx);
      return;
    }
  }
}

// --------------------------------------------------------------- detection

interface Terms {
  path: { value: string; op: DetectedPathOperator } | null;
  verb: string | null;
  extras: string[];
  /** A second path or verb test, or an `or`/`not` — not builder-shaped. */
  complex: boolean;
}

function collectTerms(node: Node, src: string, terms: Terms) {
  if (node.kind === 'and') {
    collectTerms(node.left, src, terms);
    collectTerms(node.right, src, terms);
    return;
  }
  if (node.kind === 'or' || node.kind === 'not') {
    terms.complex = true;
    terms.extras.push(src.slice(node.start, node.end));
    return;
  }
  if (node.kind === 'compare' && node.right && node.right.type === 'string') {
    const lname = node.left.text.toLowerCase();
    if (lname === PATHSUFFIX && (node.op === 'MatchesPath' || node.op === 'Matches' || node.op === 'Equals')) {
      if (terms.path) terms.complex = true;
      else terms.path = { value: node.right.value, op: node.op as DetectedPathOperator };
      return;
    }
    if (VERB_VARS.has(lname) && node.op === 'Equals') {
      if (terms.verb) terms.complex = true;
      else terms.verb = node.right.value;
      return;
    }
  }
  terms.extras.push(src.slice(node.start, node.end));
}

// --------------------------------------------------------------- public API

const EMPTY: ConditionAnalysis = {
  issues: [],
  verb: null,
  path: null,
  pathOperator: null,
  extras: [],
  simpleEquivalent: false,
  parseError: false,
};

/**
 * Checks one condition string. `basePath` is the proxy's own, and only sharpens
 * the request.path warning — leaving it out costs one rule, not correctness.
 */
export function analyzeCondition(condition: string, opts?: { basePath?: string }): ConditionAnalysis {
  const src = (condition || '').trim();
  if (!src) return EMPTY;

  let ast: Node;
  let tokens: Tok[];
  try {
    tokens = tokenize(src);
    ast = parse(tokens, src);
  } catch (err) {
    if (err instanceof ConditionParseError) {
      return {
        ...EMPTY,
        parseError: true,
        issues: [{ id: 'syntax', severity: 'error', message: err.message, start: err.start, end: err.end, fix: err.fix }],
      };
    }
    throw err;
  }

  const ctx: RuleContext = { src, basePath: opts?.basePath, issues: [] };
  walk(ast, ctx);

  for (const tok of tokens) {
    if (tok.type !== 'word' || !tok.glued) continue;
    ctx.issues.push({
      id: 'operator-no-space',
      severity: 'warning',
      message: `Apigee wants a space on each side of "${tok.text}". It reads this one either way, so nothing is broken — but a name run together with an operator is the shape that hides a real typo.`,
      start: tok.start,
      end: tok.end,
      fix: {
        label: 'Add the spaces',
        // Trimmed at the seam only. Collapsing whitespace across the whole
        // condition would reach inside string literals, where it is content.
        condition: `${src.slice(0, tok.start).replace(/\s+$/, '')} ${tok.text} ${src.slice(tok.end).replace(/^\s+/, '')}`.trim(),
      },
    });
  }

  const terms: Terms = { path: null, verb: null, extras: [], complex: false };
  collectTerms(ast, src, terms);

  const simpleEquivalent =
    !terms.complex &&
    terms.extras.length === 0 &&
    (terms.path !== null || terms.verb !== null) &&
    // The builder offers MatchesPath and Equals only; folding a `Matches` into
    // either would change what the exported bundle says.
    terms.path?.op !== 'Matches';

  return {
    issues: ctx.issues.sort((a, b) => a.start - b.start),
    verb: terms.verb,
    path: terms.path ? terms.path.value : null,
    pathOperator: terms.path ? terms.path.op : null,
    extras: terms.extras,
    simpleEquivalent,
    parseError: false,
  };
}

/**
 * The tone a condition input should wear, or undefined for one that reads
 * fine. Every condition editor in the app sets `data-tone` from this, so the
 * field itself carries the verdict and the panel under it carries the reasons.
 */
export function conditionTone(analysis: ConditionAnalysis): 'error' | 'warning' | undefined {
  let warned = false;
  for (const issue of analysis.issues) {
    if (issue.severity === 'error') return 'error';
    if (issue.severity === 'warning') warned = true;
  }
  return warned ? 'warning' : undefined;
}

/** How many of each, for a badge with no room for the messages themselves. */
export function countBySeverity(issues: ConditionIssue[]): { errors: number; warnings: number } {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors++;
    else if (issue.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}
