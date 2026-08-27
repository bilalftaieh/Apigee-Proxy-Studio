import { Router } from 'express';
import { POLICY_TYPES, getPolicyType } from '../lib/policyTemplates.js';

const router = Router();

router.get('/policy-types', (req, res) => {
  const metadata = POLICY_TYPES.map(({ key, tier, label, category, icon, accent, description, resource }) => ({
    key,
    // 'standard' | 'extensible' — Apigee's own policy classification. Surfaced
    // because it is a billing lever, not a taste one: attaching a single
    // Extensible policy re-tiers *every* call to that proxy.
    tier,
    label,
    category,
    icon,
    accent,
    description,
    hasResource: !!resource,
  }));
  res.json(metadata);
});

router.post('/policy-defaults', (req, res) => {
  const { type, name } = req.body || {};
  const policyType = getPolicyType(type);
  if (!policyType) return res.status(404).json({ error: `Unknown policy type "${type}"` });
  if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return res.status(400).json({ error: 'Policy name must be alphanumeric (., _, - allowed).' });
  }
  const xml = policyType.defaultXml(name);
  const resource = policyType.resource ? policyType.resource(name) : null;
  res.json({ xml, resource });
});

export default router;
