# Apigee Proxy Studio

A local, no-deploy visual builder for Apigee X API proxies. Design proxy endpoints,
conditional flows and policies, save reusable proxy templates, and export a real
`apiproxy` `.zip` bundle ready to import into the Apigee X console — nothing ever
touches GCP from this tool.

## Stack

- **server/** — Express API (ESM). Stores proxies/templates as JSON files under
  `server/data/`, generates real Apigee X bundle XML, and streams `.zip` exports
  via `archiver`.
- **client/** — Vite + React + TypeScript SPA. Zustand for state, Monaco Editor
  for policy/XML editing, hand-built dark UI (no component framework).

## Running it

```bash
npm install
npm run dev
```

This starts the API on `http://localhost:4310` and the UI on `http://localhost:5173`
(the Vite dev server proxies `/api` to the backend). Open the UI URL in a browser.

## Using it

1. **Start from a template or blank proxy** — the home screen offers a blank
   pass-through proxy plus a few built-in templates (secured REST API, mediation
   & fault handling).
2. **Overview tab** — proxy identity: name, base path, description.
3. **Proxy Endpoint tab** — the ProxyEndpoint's own PreFlow/PostFlow, conditional
   flows (with a Path/Verb condition builder or a raw custom-expression fallback),
   route rules, and fault handling — named conditional `<FaultRule>`s matched
   top-to-bottom, plus the unconditional DefaultFaultRule they fall back to.
4. **Target Endpoint tab** — pick a target (if you have more than one) and edit
   its URL *or* a load-balanced list of named Target Servers, an optional Path,
   and that target's own independent PreFlow/PostFlow, conditional flows, and
   fault handling. Any URL/Path field can be a literal value or a `{variable}`
   reference via the Hardcode/Variable toggle.
5. **Policies tab** — pick a policy type from the gallery (40+ types across
   Mediation, Security, Extension, Traffic Management, Caching, Storage,
   Logging, and AI/LLM), then edit its raw XML directly in Monaco — exactly
   like the real Apigee UI.
6. **Lint tab** — runs [apigeelint](https://github.com/apigee/apigeelint)
   (Apigee X profile) against the current bundle and lists every error/warning
   by file. **The Export ZIP button re-runs this and blocks if any errors are
   found** — warnings are fine to ship with, matching how most CI/CD pipelines
   gate a deploy. Saving is never blocked, so you can always save work in
   progress. Two caveats: the gate lives in the UI, so `POST /api/bundle/export`
   will happily hand you a zip without it; and if apigeelint itself fails to
   run, Export warns and proceeds rather than blocking you.
7. **XML Preview tab** — browse every file that will be in the exported bundle,
   generated live from your current (even unsaved) edits.
8. **Save as Template** — snapshot the current proxy's policies/flows/routes as
   a reusable skeleton for future proxies.
9. **Export ZIP** — downloads `<proxy-name>.zip` with the exact
   `apiproxy/{policies,proxies,targets}/...` layout Apigee X expects for
   **Deploy > Import bundle** in the console. No deployment happens from here.

## Policy XML intelligence

The raw-XML editor is schema-aware. Completion and hover come from
[`policyXmlSchema.ts`](client/src/lib/policyXmlSchema.ts) and
[`flowVariables.ts`](client/src/lib/flowVariables.ts):

- **Element and attribute completion**, from an element tree per policy type —
  children after `<`, attribute names inside a start tag, and enum values inside
  `attr="…"` or an element's body (`<TimeUnit>` offers `minute…month`).
- **Flow-variable completion** inside `{…}`, inside `ref="…"`, and inside
  elements whose content is a variable (`<Source>`, `<APIKey>`, `<KeyFragment>`).
  **Variables this proxy itself creates are listed first**, read back out of its
  own ExtractVariables / AssignMessage / KVM / ServiceCallout / LookupCache
  policies — so the list shows `req.tin` before it shows `system.timestamp`, and
  says which policy sets it. A variable written by more than one policy says so,
  which is worth knowing given last-writer-wins.
- **Hover** on an element, attribute or variable for what it does; on the policy's
  root tag for its description, whether it is an Extensible (billing-tier) policy,
  and a link to the Apigee reference page.

Coverage is 28 of Apigee's ~60 policy root tags — the 12 the visual editor already
describes, whose trees are *derived* from `POLICY_SCHEMAS` so the two cannot drift,
plus hand-authored trees for the types this workspace actually uses. Uncovered
types fall back to the elements every policy accepts. **There are deliberately no
"unknown element" squiggles**: with a partial catalogue they would underline valid
XML in the uncovered half, and a false warning in a bundle you are about to ship
costs more than a missing one.

## Undo / redo

Every edit to the open proxy or shared flow is undoable — `Ctrl+Z`, `Ctrl+Shift+Z`
(or `Ctrl+Y`) to redo, plus the two header buttons, whose tooltips show how many
steps are left. This is separate from the History modal: undo is the in-session
edit stack, history is the per-save snapshot list.

- **Typing collapses, clicking doesn't.** A run of keystrokes in one field is one
  undo step. Adding a policy, deleting a flow or moving a step is always its own
  step, however fast you click — see
  [`client/src/store/undoHistory.ts`](client/src/store/undoHistory.ts) for how
  that distinction is drawn.
- **While the caret is in a text field or in Monaco, `Ctrl+Z` belongs to that
  field**, not to the document — otherwise one keystroke would revert a whole
  policy. Use the header buttons to undo the document from inside an editor.
- **Saving is not an undo step**, but you can undo back past one; the proxy just
  goes dirty again. Opening another proxy clears the stack, and so does restoring
  from history (that restore is itself recoverable from the History modal).

## Workspace Audit

Everything above works on one proxy. **Workspace Audit** (top of the sidebar) works
on all of them at once — which is the whole reason it exists, since the Apigee
console shows you a single proxy at a time and none of these questions can be asked
there. It reads saved state from disk, so it refuses to open while an editor has
unsaved changes.

- **House Rules** — your org's own standards run across every proxy in one pass:
  DefaultFaultRule present, rate limiting on the request path, caller
  authentication, TLS to the backend, no wildcard CORS, no credentials in
  MessageLogging, versioned base path, non-empty description. These are *not*
  Apigee's rules and never block an export — edit them in
  [`server/src/seed/governanceRules.js`](server/src/seed/governanceRules.js), which
  is written to be edited. Waive one for a single proxy by adding its rule id
  (`GOV003`) to that proxy's excluded rules on its Lint tab. "Copy report" gives
  you the whole sweep as markdown.
- **Base Paths** — base paths must be unique per environment, and a second proxy
  claiming one simply fails to deploy. Reports exact conflicts (trailing slashes
  normalized), nested paths where Apigee's longest-match routing means the shorter
  proxy silently stops seeing that traffic, wildcard paths that can't be compared
  statically, and a full routing map of every surface the workspace exposes.
- **Backends** — reverse index from host and Target Server name back to the proxies
  that call them, so "I'm changing this backend, what breaks?" is one screen.
  Environment overrides are resolved, so a target that differs per environment
  appears once per distinct backend it can reach; ones that resolve identically
  everywhere appear once. Endpoints whose *host* is a flow variable are listed
  separately rather than being silently dropped from the index.
- **Shared Flow Usage** — the FlowCallout call graph. Blast radius per shared flow
  before you edit one, plus: flows called but not defined here (a hard deploy
  failure, and where a leftover template placeholder shows up), flows that are
  empty but called (deploys clean, does nothing), FlowCallout policies that exist
  but are wired into no Step, flows nothing calls, and call cycles.

## Data

Proxies and custom templates live as plain JSON files in `server/data/proxies`
and `server/data/templates` (gitignored). Built-in templates are defined in
`server/src/seed/templates.js` and are not persisted to disk.

## Linting

`apigeelint` is invoked as a CLI subprocess: each lint/export writes the
generated bundle to a temp directory, runs `apigeelint -s <dir>/apiproxy -f
json.js --profile apigeex`, parses the JSON result, and deletes the temp
directory. The first run of a session can take several seconds while it spins
up its rule engine — that's normal, not a hang.
