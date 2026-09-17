import { Router } from 'express';
import { proxiesStore } from '../lib/storage.js';
import { isSafeId } from '../lib/validateId.js';
import { normalizeProxy } from '../lib/model.js';
import { generatePolicy, previewRequest } from '../lib/ai/generatePolicy.js';
import { fixFinding, previewFixRequest } from '../lib/ai/fixFinding.js';
import { isStructuralFinding, resolveFixTarget } from '../lib/ai/fixTarget.js';
import { previewReviewRequest, reviewProxy } from '../lib/ai/reviewProxy.js';
import { AiNotConfiguredError, AiProviderError, isConfigured, providerInfo } from '../lib/ai/provider.js';
import { LeakError } from '../lib/ai/guard.js';

const router = Router();

const MAX_INTENT_LENGTH = 2000;

// Lint messages are our own or apigeelint's and run to a couple of hundred
// characters, but the finding arrives in the request body like everything else,
// so it is capped rather than trusted to be one of ours.
const MAX_FINDING_LENGTH = 4000;

// Translates the AI-specific error types into the { error } shape the rest of
// the API uses. A leak is reported as 500, not 400: the user did nothing wrong,
// we have a bug, and the message says so.
function sendError(res, err) {
  if (err instanceof AiNotConfiguredError) return res.status(503).json({ error: err.message });
  if (err instanceof LeakError) return res.status(500).json({ error: err.message, leak: true });
  if (err instanceof AiProviderError) return res.status(502).json({ error: err.message });
  return res.status(500).json({ error: err.message });
}

/**
 * Validates and resolves a request body for either endpoint.
 *
 * Both share this rather than checking their own way round, because
 * /ai/preview's entire promise is that it shows what /ai/policy would send —
 * and that only holds while the two accept exactly the same input. They used to
 * differ: preview had no length cap at all.
 *
 * @returns {{ error?: {status: number, message: string}, proxy, intent, policyType }}
 */
async function resolveRequest(body) {
  const intent = typeof body?.intent === 'string' ? body.intent : '';
  if (!intent.trim()) return { error: { status: 400, message: 'intent is required' } };
  if (intent.length > MAX_INTENT_LENGTH) {
    return {
      error: { status: 400, message: `intent is too long (${MAX_INTENT_LENGTH} characters max)` },
    };
  }

  const proxy = body?.proxy ? normalizeProxy(body.proxy) : null;

  const blocked = await aiOptOut(proxy);
  if (blocked) return { error: blocked };

  return { proxy, intent, policyType: body?.policyType || null };
}

/**
 * The opt-out is read from the SAVED proxy, not from the copy in the request
 * body — that copy is whatever the caller chose to send, so a stale tab or a
 * hand-written curl could simply omit the flag. Reading it off disk is what
 * makes "enforced server-side" true rather than decorative.
 *
 * isSafeId first: the id is joined into a file path by the store, and unlike a
 * route param it has not been through requireSafeId.
 *
 * Either copy setting it counts. The flag only ever restricts, so a workspace
 * that has just turned it on and not yet saved is honoured too.
 *
 * @returns {{status: number, message: string}|null}
 */
async function aiOptOut(proxy) {
  const saved = isSafeId(proxy?.id) ? await proxiesStore.get(proxy.id) : null;
  if (saved?.aiDisabled === true || proxy?.aiDisabled === true) {
    return { status: 403, message: 'AI features are turned off for this proxy.' };
  }
  return null;
}

/**
 * Validates a request to fix one lint finding, and resolves which policy it is
 * about.
 *
 * The finding is caller-supplied and is treated that way: it is length-capped,
 * and it only ever names a policy indirectly, by a file path that has to match
 * one already in this proxy. A forged finding cannot reach a policy that is not
 * there, and cannot claim to have been fixed either — fixFinding re-derives the
 * blockers itself and only reports a finding resolved if it was genuinely
 * present before the edit.
 */
async function resolveFixRequest(body) {
  const proxy = body?.proxy ? normalizeProxy(body.proxy) : null;
  if (!proxy) return { error: { status: 400, message: 'proxy is required' } };

  // Before anything else, and unlike resolveRequest, which reaches it only
  // after the intent checks: whether this workspace allows AI at all does not
  // depend on the caller having sent a well-formed finding.
  const blocked = await aiOptOut(proxy);
  if (blocked) return { error: blocked };

  const finding = body?.finding;
  const message = typeof finding?.message === 'string' ? finding.message : '';
  if (!message.trim()) return { error: { status: 400, message: 'finding.message is required' } };
  if (message.length > MAX_FINDING_LENGTH) {
    return {
      error: { status: 400, message: `finding.message is too long (${MAX_FINDING_LENGTH} characters max)` },
    };
  }

  if (isStructuralFinding(finding)) {
    return {
      error: {
        status: 400,
        message:
          'This one is about where the policy sits in the flows, not about the policy itself — ' +
          'no edit to its XML can resolve it. Attach or remove it on the Flow Diagram tab.',
      },
    };
  }

  const policy = resolveFixTarget(proxy, finding);
  if (!policy) {
    return {
      error: {
        status: 400,
        message:
          'This finding is not about a policy in this proxy, so there is no single file to rewrite. ' +
          'Fix it on the tab that owns the setting it names.',
      },
    };
  }
  if (!String(policy.xml || '').trim()) {
    return { error: { status: 400, message: `Policy "${policy.name}" has no XML to fix.` } };
  }

  return {
    proxy,
    policy,
    finding: {
      filePath: finding.filePath,
      ruleId: finding.ruleId || null,
      message,
      severity: finding.severity || 'error',
    },
  };
}

// Lets the client hide the feature entirely rather than offering a button that
// only ever produces a configuration error.
router.get('/ai/status', (req, res) => {
  res.json(providerInfo());
});

// Returns the exact payload /ai/policy would send, without sending it.
router.post('/ai/preview', async (req, res) => {
  const { error, ...request } = await resolveRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    res.json(await previewRequest(request));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ai/policy', async (req, res) => {
  const { error, ...request } = await resolveRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!isConfigured()) return res.status(503).json({ error: new AiNotConfiguredError().message });

  try {
    res.json(await generatePolicy(request));
  } catch (err) {
    sendError(res, err);
  }
});

/**
 * A review needs nothing from the caller but the proxy — the finding-shaped
 * input the fix endpoints validate has no counterpart here, because the review
 * decides for itself what is worth saying.
 */
async function resolveReviewRequest(body) {
  const proxy = body?.proxy ? normalizeProxy(body.proxy) : null;
  if (!proxy) return { error: { status: 400, message: 'proxy is required' } };

  const blocked = await aiOptOut(proxy);
  if (blocked) return { error: blocked };

  return { proxy };
}

// Same split as /ai/preview and /ai/policy, and for the same reason: the
// disclosure panel is only worth anything if it is built from the identical
// input the real call would use.
router.post('/ai/fix/preview', async (req, res) => {
  const { error, ...request } = await resolveFixRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    res.json(await previewFixRequest(request));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ai/fix', async (req, res) => {
  const { error, ...request } = await resolveFixRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!isConfigured()) return res.status(503).json({ error: new AiNotConfiguredError().message });

  try {
    res.json(await fixFinding(request));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ai/review/preview', async (req, res) => {
  const { error, ...request } = await resolveReviewRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    res.json(previewReviewRequest(request));
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ai/review', async (req, res) => {
  const { error, ...request } = await resolveReviewRequest(req.body);
  if (error) return res.status(error.status).json({ error: error.message });
  if (!isConfigured()) return res.status(503).json({ error: new AiNotConfiguredError().message });

  try {
    res.json(await reviewProxy(request));
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
