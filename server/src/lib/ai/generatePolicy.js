// Orchestrates one generation: build context, ask the model, check the answer,
// give it exactly one chance to fix its own mistakes, restore real values.

import { XML_HEADER } from '../xml.js';
import { POLICY_TYPES, getPolicyType } from '../policyTemplates.js';
import { getElementTree } from './elementSchema.js';
import { buildSafeContext, policyTypeCatalogue } from './safeContext.js';
import { SYSTEM_INSTRUCTION, buildPolicyPrompt, buildResponseSchema } from './policyPrompt.js';
import { generateStructured } from './provider.js';
import { restore } from './redact.js';
import { renderAndValidate } from './renderPolicy.js';

// One retry, not a loop. If a second attempt with the errors spelled out still
// fails, more attempts mostly burn quota and the user's patience — better to
// hand back the draft flagged as unvalidated and let them fix it in Monaco,
// where they were going to end up anyway.
const MAX_ATTEMPTS = 2;

// The type-specific half of what buildSafeContext fills in when the caller names
// a policy type up front, applied once the MODEL has chosen one instead. From
// here on a choose-the-type request is briefed exactly like a request that knew
// its type all along. Every value comes from our own static template catalogue,
// so nothing this adds is workspace-derived.
function withResolvedType(context, type) {
  return {
    ...context,
    policyType: type.key,
    policyLabel: type.label,
    policyCategory: type.category,
    policyRootTag: type.xmlTag || type.key,
    template: type.defaultXml('PolicyName'),
  };
}

// Returns { text, staticText }. The element tree is read through
// elementSchema's cache, so composing a second prompt mid-request costs a map
// lookup, not a file read.
async function buildPrompt(context, catalogue) {
  const elementTree = context.policyRootTag ? await getElementTree(context.policyRootTag) : null;
  return buildPolicyPrompt({ context, elementTree, catalogue });
}

/**
 * Assembles everything that would be sent, without sending it. This is what
 * powers the "show me exactly what gets sent" panel — the user sees the real
 * payload, not a description of it, which is the only version of that promise
 * worth making.
 */
export async function previewRequest({ proxy, intent, policyType }) {
  const { context, map } = buildSafeContext(proxy, { policyType, intent });
  const catalogue = policyType ? null : policyTypeCatalogue(POLICY_TYPES);
  const { text } = await buildPrompt(context, catalogue);

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: text,
    // What was hidden and what it was replaced with — shown as counts and
    // placeholder names, never the real values, so the panel itself is safe to
    // screenshot or paste into a ticket.
    substitutions: [...map.reverse.keys()].map((token) => ({
      placeholder: token,
      characters: map.reverse.get(token).length,
    })),
  };
}

export async function generatePolicy({ proxy, intent, policyType = null }) {
  const { context, map } = buildSafeContext(proxy, { policyType, intent });
  const catalogue = policyType ? null : policyTypeCatalogue(POLICY_TYPES);

  // Null until the policy type is known. When the caller named it, that is now;
  // when the model is choosing, it is the moment the first reply lands.
  let resolvedKey = policyType;
  let base = await buildPrompt(context, catalogue);
  let schema = buildResponseSchema({ chooseType: !resolvedKey });
  let prompt = base.text;
  let last = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await generateStructured({
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      responseSchema: schema,
      proxy,
      staticPromptText: base.staticText,
    });

    const chosenType = getPolicyType(resolvedKey || result.policyType);
    if (!chosenType) {
      prompt = `${base.text}\n\nYour previous answer named a policy type that does not exist. Choose one from the list above.`;
      last = { result, errors: [{ message: `Unknown policy type "${result.policyType}".` }], xml: '' };
      continue;
    }

    const checked = await renderAndValidate(result, chosenType);
    const errors = checked.errors;

    if (checked.ok) {
      return {
        ok: true,
        // Placeholders go back to real values only now, at the very end, so no
        // intermediate copy of the XML ever holds both.
        xml: restore(XML_HEADER + checked.canonical, map),
        policyType: chosenType.key,
        name: result.policyName,
        notes: restore(result.notes || '', map),
        attempts: attempt,
        warnings: [],
      };
    }

    last = { result, errors, xml: checked.xml, chosenType };

    // Lock the type in and re-brief with ITS grammar before retrying.
    //
    // This is what makes the retry worth an attempt in the choose-the-type
    // path, which is the UI default. That first prompt carries the catalogue
    // and no grammar at all, because which grammar applies is precisely the
    // question the model is answering — so repeating it would tell the model to
    // "use only elements from the grammar above" with no grammar above, and the
    // second attempt would reproduce the invented element that failed the
    // first. The validator judges against the chosen type's grammar; the model
    // has to be shown the same thing the validator is reading.
    if (!resolvedKey) {
      resolvedKey = chosenType.key;
      base = await buildPrompt(withResolvedType(context, chosenType), null);
      schema = buildResponseSchema({ chooseType: false });
    }

    prompt = [
      base.text,
      '',
      'Your previous answer was rejected by the validator:',
      ...errors.map((e) => `- ${e.message}`),
      '',
      'Produce a corrected policy. Use only elements from the grammar above.',
    ].join('\n');
  }

  // Both attempts failed validation. Return the draft anyway, clearly marked —
  // a near-miss the user can fix in the editor is more useful than an error
  // message, and the UI shows these warnings next to the diff.
  return {
    ok: false,
    xml: restore(last?.xml || '', map),
    policyType: last?.chosenType?.key || policyType,
    name: last?.result?.policyName || '',
    notes: restore(last?.result?.notes || '', map),
    attempts: MAX_ATTEMPTS,
    warnings: (last?.errors || []).map((e) => e.message),
  };
}
