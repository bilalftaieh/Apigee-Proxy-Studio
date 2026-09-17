// Checks generated XML before it is allowed anywhere near a workspace.
//
// Everything here is deterministic and fast — no subprocess, no network, single
// -digit milliseconds. The heavyweight apigeelint pass is unchanged and still
// runs where it always has, over the whole bundle from the Lint tab. Putting
// apigeelint in this loop would add 10-30 seconds to every generation to catch
// problems the user is about to see anyway.
//
// Reuses the parsers the importer already trusts rather than introducing a
// second opinion about what valid policy XML looks like.

import { canonicalizeXml } from '../canonicalXml.js';
import { extractRootTagName } from '../xmlImportUtils.js';
import { POLICY_TYPES } from '../policyTemplates.js';
import { collectElementNames, getElementTree } from './elementSchema.js';

const KNOWN_ROOT_TAGS = new Set(POLICY_TYPES.map((t) => t.xmlTag || t.key));
const POLICY_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * @returns {{ ok: boolean, xml: string, rootTag: string|null, errors: {message: string}[] }}
 *   `errors` is fed straight back to the model on the retry, so each message is
 *   written to be actionable by a reader who cannot see this code.
 */
export async function validatePolicyXml(xml, { expectedRootTag = null, policyName = null } = {}) {
  const errors = [];

  if (!xml || !xml.trim()) {
    return { ok: false, xml: '', rootTag: null, errors: [{ message: 'No XML was produced.' }] };
  }

  // Well-formedness. canonicalizeXml parses with fast-xml-parser and rebuilds,
  // so anything it survives is parseable, and we get tidy indentation for free.
  let canonical;
  try {
    canonical = canonicalizeXml(xml);
    if (!canonical || !canonical.trim()) throw new Error('empty result');
  } catch (err) {
    return {
      ok: false,
      xml,
      rootTag: null,
      errors: [{ message: `The XML is not well-formed: ${err.message}` }],
    };
  }

  const rootTag = extractRootTagName(xml);

  if (!rootTag) {
    errors.push({ message: 'Could not find a root element.' });
  } else if (!KNOWN_ROOT_TAGS.has(rootTag)) {
    errors.push({
      message: `<${rootTag}> is not an Apigee policy type. Use one of the documented policy root elements.`,
    });
  } else if (expectedRootTag && rootTag !== expectedRootTag) {
    errors.push({
      message: `Expected a <${expectedRootTag}> policy but got <${rootTag}>.`,
    });
  }

  if (policyName && !POLICY_NAME_PATTERN.test(policyName)) {
    errors.push({
      message: `Policy name "${policyName}" is invalid. Use only letters, digits, dot, dash and underscore.`,
    });
  }

  // Element-name check against the scraped grammar. Position-insensitive by
  // design — see the note on collectElementNames — so this catches invented
  // elements without failing on a legal element the scrape recorded under a
  // different parent.
  if (rootTag && KNOWN_ROOT_TAGS.has(rootTag)) {
    const tree = await getElementTree(rootTag);
    if (tree) {
      const allowed = collectElementNames(tree);
      // Universal across every policy, so not always present in the scraped
      // per-policy grammar.
      allowed.add('DisplayName');

      const used = new Set([...xml.matchAll(/<([A-Za-z][A-Za-z0-9_.-]*)[\s/>]/g)].map((m) => m[1]));
      const unknown = [...used].filter((name) => name !== rootTag && !allowed.has(name));

      if (unknown.length) {
        errors.push({
          message:
            `These elements do not exist in a <${rootTag}> policy: ${unknown.join(', ')}. ` +
            `Valid elements are: ${[...allowed].filter((n) => n !== rootTag).join(', ')}.`,
        });
      }
    }
  }

  return { ok: errors.length === 0, xml: canonical, rootTag, errors };
}
