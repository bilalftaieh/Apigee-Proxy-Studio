import { Router } from 'express';
import { POLICY_CHAINS } from '../seed/policyChains.js';

const router = Router();

router.get('/policy-chains', (req, res) => {
  res.json(POLICY_CHAINS);
});

export default router;
