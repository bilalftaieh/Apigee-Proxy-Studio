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
  constructor(message, status) {
    super(message);
    this.name = 'AiProviderError';
    this.status = status;
  }
}

export function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export function providerInfo() {
  return {
    configured: isConfigured(),
    provider: 'gemini',
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
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
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    // Google's 404 body usually names the successor model, which is far more
    // useful than anything this code could guess — so pass it through.
    const suggested = body.match(/use models\/([\w.-]+)/)?.[1];
    return (
      `Gemini no longer serves the model "${model}"` +
      (suggested ? `. Set GEMINI_MODEL=${suggested} in your .env file and restart.` : '. Set GEMINI_MODEL in .env to a current model name.')
    );
  }
  if (status === 503) {
    return `The Gemini free tier is busy right now ("${(process.env.GEMINI_MODEL || DEFAULT_MODEL)}" is at capacity). This is temporary — try again in a minute, or set GEMINI_MODEL to a lighter model such as gemini-3.1-flash-lite in your .env file.`;
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

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
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
    throw new AiProviderError(describeHttpError(res.status, bodyText), res.status);
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
