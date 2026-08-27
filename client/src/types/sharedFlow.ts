import type { BundleResource, Policy, Step } from './proxy';

export interface SharedFlow {
  id: string;
  name: string;
  description: string;
  policies: Policy[];
  /** Flat, ordered — a Shared Flow has no Request/Response split or conditional flows of its own. */
  steps: Step[];
  resources: BundleResource[];
  lintExcludes: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SharedFlowSummary {
  id: string;
  name: string;
  description: string;
  updatedAt: number;
  createdAt: number;
  policyCount: number;
  stepCount: number;
}
