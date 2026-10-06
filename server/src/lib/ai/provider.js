// The only place in this codebase that talks to a third-party model.
//
// Everything funnels through generateStructured() for one reason: it is where
// assertNoLeak() runs. Keeping the network call in a single function means the
// guard cannot be bypassed by a future caller who forgets it exists — there is
// no other door.
//
// Uses the global fetch built into Node 18+, so this adds no dependency.

import { assertNoLeak } from './guard.js';
import { createLogger } from '../log/logger.js';

// WHAT THIS LOGGER MAY RECORD, and why the list is short.
//
// This module's whole premise is that the user's workspace does not leave the
// machine unexamined; a log file that quietly wrote out every prompt would
// reintroduce, on disk, exactly what the guard exists to prevent — and the log
// is the artifact people paste into bug reports. So: sizes, timings, models,
// HTTP statuses and finish reasons. Never the prompt, never the intent line,
// never the response text.
const log = createLogger('ai');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Flash is what the free tier serves, and it is the right size for this job —
// constrained structured output over a schema we supply, not open-ended
// reasoning.
//
// Google retires model names out from under callers: gemini-2.5-flash started
// returning 404 "no longer available to new users" and named this as the
// replacement. Expect to move again. A floating alias like gemini-flash-latest
// would dodge that, but it also silently changes model behaviour underneath a
// prompt that was tuned against a specific one, so this stays pinned and the
// 404 message below tells the user exactly what to do when it expires.
const DEFAULT_MODEL = 'gemini-3.6-flash';

// The two we vouch for, shown first and always present.
//
// This is NOT the menu — the menu comes from Google (see listModels below).
// Hardcoding the full lineup here would rot for exactly the reason the comment
// above DEFAULT_MODEL describes: Google adds and retires models on its own
// schedule, and a list baked into this file is wrong the day after it ships.
// These two are the ones this prompt has been exercised against, and the pair
// the 503 path swings between, so they are worth calling out by hand.
const MODEL_CATALOG = [
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Default. Best answers, busiest tier.', recommended: true },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    note: 'Lighter. Usually has capacity when the default does not.',
    recommended: true,
  },
];

// Google's list does not change minute to minute, and the picker asks for it
// every time it opens. Ten minutes keeps a newly released model reachable
// within one coffee break without making a menu click cost a round trip.
const MODEL_LIST_TTL_MS = 10 * 60_000;
let modelListCache = { at: 0, models: null };

// Disqualifying words anywhere in a model id. Every one of these names a model
// that answers generateContent but does not do THIS job: returning JSON that
// decodes against a responseSchema. They were taken from a real ListModels
// response, not guessed — image and audio output, transcription, computer use,
// robotics and the custom-tools variant all appear in the same list as the
// text models and are indistinguishable by their supported methods alone.
const NOT_TEXT_MODEL = /(image|tts|transcribe|audio|computer-use|robotics|omni|live|realtime|embedding|customtools)/i;

/**
 * Whether a model Google lists can do this app's job.
 *
 * An allowlist by shape rather than a denylist of families, because the denylist
 * loses. A real key lists music models (lyria-*), image models
 * (nano-banana-pro-*), research and coding agents (deep-research-*,
 * antigravity-*) and robotics models alongside the text ones, and Google adds
 * new families faster than anyone edits this file. Requiring the id to look
 * like `gemini-<version>-<flash|pro>` admits the general-purpose text models
 * and nothing else, including families that do not exist yet.
 *
 * `-latest` aliases are excluded by the same rule, which is deliberate and is
 * the position the comment above DEFAULT_MODEL already argues: a floating alias
 * silently changes model behaviour underneath a prompt tuned against a specific
 * one. If you want the newest, pick it by name and know which one you picked.
 *
 * Gemma is excluded too — it is served through this same API and accepts
 * generateContent, but rejects responseSchema, so offering it would hand the
 * user a model that fails on every single generation.
 */
function usableForStudio(model) {
  const id = String(model?.name || '').replace(/^models\//, '');
  if (!(model?.supportedGenerationMethods || []).includes('generateContent')) return false;
  // A version digit right after the family name. Drops gemma and learnlm, the
  // `-latest` aliases, and every non-gemini family in one test.
  if (!/^gemini-\d/i.test(id)) return false;
  // The two general-purpose tiers. Drops gemini-3.5-transcribe and friends,
  // which pass the test above on a technicality.
  if (!/(flash|pro)/i.test(id)) return false;
  return !NOT_TEXT_MODEL.test(id);
}

/**
 * Google's `description` is a paragraph; the picker has room for a line.
 *
 * For a good half of the current models the description is just the display
 * name again ("Gemini 3.8 Flash"), and the row already prints the id above it —
 * so that gets dropped in favour of the context size, which at least says
 * something the id does not.
 */
function noteFor(model) {
  const text = String(model?.description || '').replace(/\s+/g, ' ').trim();
  const name = String(model?.displayName || '').trim();
  if (text && text.toLowerCase() !== name.toLowerCase()) {
    return text.length > 110 ? `${text.slice(0, 107)}…` : text;
  }
  const limit = model?.inputTokenLimit;
  return limit ? `${name || 'Gemini'} · ${Math.round(limit / 1000)}k token context.` : name || 'Served by your Gemini key.';
}

/**
 * Every model this API key can actually use, newest-looking first.
 *
 * Falls back to MODEL_CATALOG rather than throwing. A picker is a convenience;
 * losing the network should not also lose the ability to switch off a model
 * that is busy — which is the one moment someone reaches for it.
 */
export async function listModels() {
  if (!isConfigured()) return { models: withActive(MODEL_CATALOG), source: 'catalog' };

  const fresh = Date.now() - modelListCache.at < MODEL_LIST_TTL_MS;
  if (fresh && modelListCache.models) return { models: withActive(modelListCache.models), source: 'live' };

  const done = log.start('list-models');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let payload;
    try {
      // pageSize is generous on purpose: the list runs to a few dozen entries
      // and paging through it would make the menu open in stages.
      const res = await fetch(`${ENDPOINT}?pageSize=200`, {
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY },
        signal: controller.signal,
      });
      if (!res.ok) throw new AiProviderError(`Could not list models (HTTP ${res.status}).`, res.status);
      payload = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const curated = new Map(MODEL_CATALOG.map((m) => [m.id, m]));
    const models = (payload?.models || [])
      .filter(usableForStudio)
      .map((m) => {
        const id = String(m.name).replace(/^models\//, '');
        // A curated entry wins on the text: our note says what the model is FOR
        // here, which Google's own description cannot know.
        return curated.get(id) || { id, label: m.displayName || id, note: noteFor(m), recommended: false };
      })
      // Ours first and in our order, then the rest with the newest-looking
      // names on top — descending sort puts 3.6 above 3.1 and 2.5.
      .sort((a, b) => {
        if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
        if (a.recommended) return MODEL_CATALOG.findIndex((m) => m.id === a.id) - MODEL_CATALOG.findIndex((m) => m.id === b.id);
        return b.id.localeCompare(a.id, 'en', { numeric: true });
      });

    // A filter that matched nothing means Google changed the shape of this
    // response, not that the key can use no models — keep the known-good pair.
    if (!models.length) throw new AiProviderError('The model list came back with nothing usable.', 502);

    modelListCache = { at: Date.now(), models };
    done('info', { count: models.length });
    return { models: withActive(models), source: 'live' };
  } catch (err) {
    done('warn', { err });
    // A list fetched an hour ago is still a far better menu than the built-in
    // pair, and a network blip is the likeliest reason to be here. Only fall
    // all the way back when there has never been a successful fetch.
    if (modelListCache.models) return { models: withActive(modelListCache.models), source: 'stale' };
    return { models: withActive(MODEL_CATALOG), source: 'catalog' };
  }
}

/**
 * Drops the cached list so the next call refetches.
 *
 * Exists for the tests, which stub global fetch per case and would otherwise
 * read each other's results out of a module-level cache. Harmless in
 * production, where nothing calls it.
 */
export function clearModelCache() {
  modelListCache = { at: 0, models: null };
}

/**
 * Guarantees the model currently in force is in the list it is shown beside.
 *
 * Without this, a model pinned in .env that Google no longer lists — which is
 * precisely the case that produces the 404 this app translates — would vanish
 * from the picker while the chip above it still named it.
 */
function withActive(models) {
  const model = activeModel();
  if (models.some((m) => m.id === model)) return models;
  return [...models, { id: model, label: model, note: 'Set in your .env file.', recommended: false }];
}

// What a 503 offers as the one-click way out.
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

// A model name is interpolated into the request URL, so it is checked against
// the shape Google actually uses rather than accepted as any string. It is
// deliberately wider than MODEL_CATALOG: when Google retires a model its 404
// names the successor, and that message is only worth printing if you can act
// on it — including by typing it in.
const MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9.\-_]{0,63}$/;

// Set by POST /ai/model, gone on restart. Deliberately NOT written back to
// .env: that file holds the permanent choice someone made by hand, and this is
// the temporary one they made because the free tier was congested this
// afternoon. Same lifetime rule as the log levels, which are also settable at
// runtime and also never persisted — see routes/logs.js.
let modelOverride = null;

/** The model every call in this module uses. Override, then .env, then ours. */
export function activeModel() {
  return modelOverride || process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

/**
 * Applies a runtime model override, or clears it back to .env when given null.
 *
 * Returns providerInfo() rather than nothing, so a caller has no opportunity to
 * report a model other than the one now actually in force.
 *
 * @throws {RangeError} when the name could not be a model id.
 */
export function setModel(id) {
  if (id === null || id === undefined || id === '') {
    modelOverride = null;
    return providerInfo();
  }
  if (typeof id !== 'string' || !MODEL_NAME.test(id)) {
    throw new RangeError(`"${String(id).slice(0, 80)}" is not a valid model name.`);
  }
  modelOverride = id;
  return providerInfo();
}

/**
 * The lighter model to offer when `model` is at capacity — or null when the
 * model that just failed IS the lighter one, because a button that switches to
 * the model you are already on is worse than no button.
 */
function fallbackFor(model) {
  return model === FALLBACK_MODEL ? null : FALLBACK_MODEL;
}

// Generous because the free tier is frequently congested: a 503 alone has taken
// 14s to come back. Still short enough that a hung request fails rather than
// leaving the modal spinning indefinitely.
const TIMEOUT_MS = 45_000;

// A 503 from Gemini is explicitly temporary ("spikes in demand are usually
// temporary"), so it is worth one quiet retry before bothering the user.
const OVERLOAD_RETRIES = 1;
const OVERLOAD_BACKOFF_MS = 2_000;

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI features are off because GEMINI_API_KEY is not set. Add it to the .env file ' +
        'in the project root, then restart the server.'
    );
    this.name = 'AiNotConfiguredError';
  }
}

export class AiProviderError extends Error {
  constructor(message, status, { fallbackModel = null } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
    // Set only on a 503, and only when there is a lighter model than the one
    // that failed. The UI turns it into a one-click "switch and retry" — which
    // is the whole reason the message below no longer tells anyone to go and
    // edit a file mid-task.
    this.fallbackModel = fallbackModel;
  }
}

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function providerInfo() {
  const model = activeModel();
  return {
    configured: isConfigured(),
    provider: 'gemini',
    model,
    // Where the current choice came from, so the UI can mark an override as
    // lasting only until restart instead of implying .env now reads this way.
    source: modelOverride ? 'override' : 'env',
    // Only the vouched-for pair, plus whatever is running. This is the menu the
    // picker can draw the instant it opens, with no network call — GET
    // /ai/models fetches the full lineup from Google and replaces it. A picker
    // that renders empty for a round trip is worse than one that starts short.
    models: withActive(MODEL_CATALOG),
  };
}

function describeHttpError(status, body) {
  // The provider's own error bodies are unhelpful out of context, so the common
  // ones are translated into something that says what to actually do.
  if (status === 400 && /API key not valid/i.test(body)) {
    return 'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.';
  }
  if (status === 429) {
    return 'Gemini rate limit reached. The free tier allows a limited number of requests per day — wait a few minutes, or enable billing on the Google Cloud project behind this key.';
  }
  if (status === 404) {
    const model = activeModel();
    // Google's 404 body usually names the successor model, which is far more
    // useful than anything this code could guess — so pass it through.
    const suggested = body.match(/use models\/([\w.-]+)/)?.[1];
    return (
      `Gemini no longer serves the model "${model}"` +
      (suggested
        ? `. Switch to ${suggested} above to keep going now, or set GEMINI_MODEL=${suggested} in .env to make it permanent.`
        : '. Pick another model above, or set GEMINI_MODEL in .env to a current model name.')
    );
  }
  if (status === 503) {
    const model = activeModel();
    // No longer "go edit .env and restart": the fallback rides along on the
    // error as fallbackModel, and the UI offers it as a button. When there is
    // no lighter model left to offer, waiting really is the only advice.
    return (
      `The Gemini free tier is busy right now ("${model}" is at capacity). This is temporary — ` +
      (fallbackFor(model)
        ? 'try again in a minute, or switch to a lighter model.'
        : 'try again in a minute.')
    );
  }
  return `Gemini request failed (HTTP ${status}): ${body.slice(0, 300)}`;
}

/**
 * Sends a prompt and gets back JSON conforming to responseSchema.
 *
 * Asking for structured JSON rather than free-text XML is what makes generated
 * policies dependable: the model is decoding against our schema, so it cannot
 * emit an element that the schema does not contain. Malformed XML stops being a
 * failure mode we have to catch, because the model never writes XML at all — we
 * render it from the returned object.
 *
 * `proxy` is required, not optional: it is the reference the leak guard checks
 * the outgoing payload against.
 *
 * `staticPromptText` is the portion of `prompt` the caller built from this
 * repo's own constants (buildPolicyPrompt returns it). The guard subtracts it
 * before searching, so our own Apigee grammar cannot be mistaken for the user's
 * data. It is the caller's job to pass only constants here.
 *
 * It may be an array. The guard matches each chunk as a contiguous substring,
 * which works for a prompt whose static half is one trailing block but not for
 * one whose scaffolding is interleaved with the workspace's content the whole
 * way down — the review prompt hands back its section headings individually for
 * exactly that reason.
 */
export async function generateStructured({
  systemInstruction,
  prompt,
  responseSchema,
  proxy,
  staticPromptText = '',
}) {
  if (!isConfigured()) throw new AiNotConfiguredError();

  // Read once, before the retry loop: an override applied while a request is
  // already in flight takes effect on the next call, not halfway through this
  // one's retry — which would report a model that did not produce the error.
  const model = activeModel();
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      // Low but not zero: policy generation wants the obvious answer, not a
      // creative one, but a little slack helps the retry produce something
      // different from the attempt that just failed validation.
      temperature: 0.2,
    },
  };

  // THE GUARD. Runs on the fully assembled payload — prompt, system
  // instruction, schema and all — immediately before it leaves the process.
  // Throws LeakError and sends nothing if anything sensitive survived.
  //
  // The three strings it is told to discount are the ones this process wrote
  // from its own source: the system instruction, the static half of the prompt,
  // and the response schema. Everything else in `body` — most importantly the
  // user's intent line — is still searched.
  try {
    assertNoLeak(body, proxy, [
      systemInstruction,
      ...(Array.isArray(staticPromptText) ? staticPromptText : [staticPromptText]),
      JSON.stringify(responseSchema),
    ]);
  } catch (err) {
    // The one event in this app that most needs a permanent record: the guard
    // stopped a payload that was about to leave the machine. Logged at fatal
    // (nothing was sent — the severity is about how much someone needs to see
    // it, not about the process surviving) and WITHOUT the payload, since
    // writing the thing we just refused to transmit into a file people share
    // would defeat the point. What kind of literal leaked is in the error;
    // where it leaked from is this line.
    log.fatal('outbound guard blocked the request', { model, err });
    throw err;
  }

  const done = log.start('generate', {
    model,
    // Size, not content. Enough to spot a prompt that has grown past what the
    // model handles well, or a truncation bug, without recording a word of it.
    promptBytes: prompt.length,
    schemaKeys: Object.keys(responseSchema?.properties || {}).length || undefined,
  });

  // Retries only on 503, and only after the guard has already cleared the
  // payload above — a retry re-sends the exact same checked bytes, so it cannot
  // reintroduce anything the guard rejected.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await sendOnce(model, body);
      done('info', { attempts: attempt + 1 });
      return result;
    } catch (err) {
      const overloaded = err instanceof AiProviderError && err.status === 503;
      if (!overloaded || attempt >= OVERLOAD_RETRIES) {
        // Logged here rather than at the route so the duration and attempt
        // count travel with it — a 45s timeout and an instant 400 are the same
        // line to the caller and entirely different problems.
        done('error', { attempts: attempt + 1, status: err.status, err });
        throw err;
      }
      log.warn('provider overloaded — retrying', { model, status: 503, backoffMs: OVERLOAD_BACKOFF_MS });
      await new Promise((resolve) => setTimeout(resolve, OVERLOAD_BACKOFF_MS));
    }
  }
}

async function sendOnce(model, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Header, not a query parameter: keys in URLs end up in logs and proxy
        // access records.
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AiProviderError(`Gemini did not respond within ${TIMEOUT_MS / 1000}s.`, 504);
    }
    throw new AiProviderError(`Could not reach Gemini: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const bodyText = await res.text();
    // The provider's own error text, capped at the same 300 characters
    // describeHttpError already shows the user for an untranslated status —
    // this adds no exposure the UI does not already have, and it carries the
    // detail the translated messages deliberately drop (quota names, the
    // successor model a 404 suggests).
    log.warn('provider returned an error', { status: res.status, body: bodyText.slice(0, 300) });
    throw new AiProviderError(describeHttpError(res.status, bodyText), res.status, {
      fallbackModel: res.status === 503 ? fallbackFor(model) : null,
    });
  }

  const payload = await res.json();
  // Token counts are the cost signal and the size signal in one, and they are
  // numbers about the request rather than any part of its content.
  const usage = payload?.usageMetadata;
  log.debug('provider responded', {
    model,
    status: res.status,
    promptTokens: usage?.promptTokenCount,
    outputTokens: usage?.candidatesTokenCount,
    finishReason: payload?.candidates?.[0]?.finishReason,
  });

  const blocked = payload?.promptFeedback?.blockReason;
  if (blocked) {
    throw new AiProviderError(`Gemini declined the request (${blocked}).`, 422);
  }

  // Pick the first part that actually carries text rather than assuming index 0.
  // The current default is a thinking model: today it returns one part whose
  // reasoning rides along as a sibling `thoughtSignature` key, but these models
  // can also emit a separate reasoning part first, and indexing blindly would
  // read that as an empty response.
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts.find((part) => !part.thought && typeof part.text === 'string' && part.text.trim())?.text;
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason;
    throw new AiProviderError(
      reason && reason !== 'STOP'
        ? `Gemini stopped early (${reason}) without returning a policy.`
        : 'Gemini returned an empty response.',
      502
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new AiProviderError('Gemini returned malformed JSON despite a response schema.', 502);
  }
}
