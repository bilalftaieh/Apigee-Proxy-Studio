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

Two modes, depending on whether you're editing the code or just using the tool.

### Development

```bash
npm install
npm run dev
```

This starts the API on `http://localhost:4310` and the UI on `http://localhost:5173`
(the Vite dev server proxies `/api` to the backend). Open the UI URL in a browser.
Both processes reload on change.

### As an app

Build once and the API server serves the UI itself, so there's one process on one
port — no Vite, no second window:

```bash
npm run build
npm start
```

Then open `http://127.0.0.1:4310`. The static mount is keyed on `client/dist`
existing rather than on `NODE_ENV`, so a plain `npm start` after a build is all
it takes.

### As an app, without typing anything (Windows)

`Studio.cmd` in the repo root does the two commands above for you, and only when
they're needed. Double-click it (or `npm run app`) and it will:

- run `npm install` if `node_modules` is missing, and build the UI if
  `client/dist` isn't there yet;
- start the server hidden in the background if nothing is already answering on
  its port — if the app is already up it just opens the browser, so clicking it
  twice is harmless;
- start a watcher that rebuilds `client/dist` whenever client code changes, and
  reloads any page you have open (see below);
- open `http://127.0.0.1:4310`.

```bash
Studio.cmd            # start if needed, then open the app
Studio.cmd status     # is the server and watcher up, and on which port
Studio.cmd restart    # rebuild, then restart (after a git pull, or a server change)
Studio.cmd stop
```

To never think about it again:

```bash
Studio.cmd install
```

That registers a `Apigee Proxy Studio` logon task so the server is running from
the moment you sign in, and drops a Desktop shortcut. After that, a bookmark to
`http://127.0.0.1:4310` behaves like any other web app. `Studio.cmd uninstall`
removes both.

#### Picking up client changes

The watcher runs `vite build --watch`, so an edit under `client/src` lands in
`client/dist` in about a second, and the server starts with `STUDIO_WATCH=1`,
which adds a few lines to the served `index.html` that poll `/api/build-id` and
reload the page when the build id changes. Edit a component, look at the
browser, see the change — no build step, no refresh.

Two things it is not:

- **It is not the Vite dev server.** There's no HMR, so a reload is a full
  reload and component state goes with it. `npm run dev` is still the better
  seat for a long UI session; this is for using the tool while occasionally
  changing it.
- **It does not type-check.** `vite build --watch` skips the `tsc -b` pass that
  `npm run build` runs, so type errors surface in your editor and at the next
  full build (`Studio.cmd restart`, or `-Rebuild`), not in the watcher log.

Server-side changes are not watched at all — `server/` is a plain `node` process
here, so `Studio.cmd restart` after editing it. `Studio.cmd` with `-NoWatch`
skips the watcher entirely (and `install -NoWatch` registers a logon task that
just serves the last build, if you'd rather not have a watcher resident all
day). Watcher output goes to `server/logs/watcher.*.log`.

Nothing above changes `npm start`: `STUDIO_WATCH` is unset there, so the server
serves `client/dist/index.html` byte for byte and `/api/build-id` doesn't exist.

#### Details

The launcher reads `API_PORT` the same way the server does, so changing it in
`.env` moves the launcher too. It deliberately does *not* run
`scripts/free-ports.ps1` the way `npm start` does: killing whatever holds the
port is right for a dev restart, wrong for a launcher that should attach to the
session you already have open. Its stdout/stderr go to
`server/logs/launcher.*.log`; the app's own structured log is still
`server/logs/studio.log` (`npm run logs`).

It also tracks the watcher by PID file (`server/logs/watcher.pid`) rather than
by port, since the watcher doesn't listen on one, and checks the process name
before killing so a recycled PID can't cost you an unrelated process.

### Configuration

Every setting is optional — copy `.env.example` to `.env` and fill in only what
you need. The one you're most likely to want is `GEMINI_API_KEY`, which turns on
the AI assistance; everything else already defaults to what the commands above
use. `.env` is gitignored, so the key stays on your machine.

Note that `API_HOST` defaults to `127.0.0.1` on purpose: the local API is
unauthenticated, so it should not be reachable from your network.

## Using it

1. **Start from a template or blank proxy** — the home screen offers a blank
   pass-through proxy plus a few built-in templates (secured REST API, mediation
   & fault handling).
2. **Or import one** — an OpenAPI spec, WSDL, Postman collection or curl command
   becomes the proxy's *API surface* (base path, conditional flows, target URL),
   and the import dialog's second step can lay a template's *policy layer* on
   top of it: policies, PreFlow/PostFlow attachments and fault handling. The
   rule is one sentence — **the artifact owns the surface, the template owns the
   policy layer** — so every conflict resolves toward the artifact (your base
   path, flows and backend URL are never overwritten) and each one is reported
   as a toast. Template steps run *before* the imported ones, since a template's
   policies are usually the gate. Applying a template to a proxy that already
   exists is a separate, explicit action (`POST /proxies/:id/apply-template`,
   snapshotted to history so it's undoable); the `.zip` bundle import
   deliberately doesn't offer the inline option, because a bundle is already a
   complete proxy rather than a bare surface.
3. **Overview tab** — proxy identity: name, base path, description.
4. **Proxy Endpoint tab** — the ProxyEndpoint's own PreFlow/PostFlow, conditional
   flows (with a Path/Verb condition builder or a raw custom-expression fallback),
   route rules, and fault handling — named conditional `<FaultRule>`s matched
   top-to-bottom, plus the unconditional DefaultFaultRule they fall back to.
5. **Target Endpoint tab** — pick a target (if you have more than one) and edit
   its URL *or* a load-balanced list of named Target Servers, an optional Path,
   and that target's own independent PreFlow/PostFlow, conditional flows, and
   fault handling. Any URL/Path field can be a literal value or a `{variable}`
   reference via the Hardcode/Variable toggle.
6. **Policies tab** — pick a policy type from the gallery (40+ types across
   Mediation, Security, Extension, Traffic Management, Caching, Storage,
   Logging, and AI/LLM), then edit its raw XML directly in Monaco — exactly
   like the real Apigee UI.
7. **Lint tab** — runs [apigeelint](https://github.com/apigee/apigeelint)
   (Apigee X profile) against the current bundle and lists every error/warning
   by file. **The Export ZIP button re-runs this and blocks if any errors are
   found** — warnings are fine to ship with, matching how most CI/CD pipelines
   gate a deploy. Saving is never blocked, so you can always save work in
   progress. Two caveats: the gate lives in the UI, so `POST /api/bundle/export`
   will happily hand you a zip without it; and if apigeelint itself fails to
   run, Export warns and proceeds rather than blocking you.
8. **XML Preview tab** — browse every file that will be in the exported bundle,
   generated live from your current (even unsaved) edits.
9. **Save as Template** — snapshot the current proxy's policies/flows/routes as
   a reusable skeleton for future proxies.
10. **Export ZIP** — downloads `<proxy-name>.zip` with the exact
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

Coverage is **all 60 policy root tags**, from three layers merged most- to
least-hand-checked:

1. the 12 the visual editor already describes, *derived* from `POLICY_SCHEMAS` so
   the two cannot drift;
2. hand-authored trees for the types this workspace leans on, whose prose says
   what actually goes wrong rather than what the element is;
3. the rest generated from the live Apigee X reference documentation by
   `npm run generate:policy-schemas` — including the Apigee X-era policies
   (LLMTokenQuota, SemanticCache*, HTTPModifier, DataCapture, the integration
   policies) that no published schema covers.

The generated layer only ever *fills gaps*: regenerating it can add elements and
descriptions but never overwrites a hand-written one. Re-run the generator when
Apigee ships new policies; it reports what it could not parse instead of guessing.

**There are deliberately no "unknown element" squiggles.** The catalogue is built
largely from documentation samples, which show what is valid rather than
exhaustively what is allowed, so an element the docs never demonstrate is absent
without being wrong to write — and a false warning in a bundle you are about to
ship costs more than a missing one.

### If completions show icons but no names

That means Monaco's measured size has gone stale — it sizes the completion
list's text column from `editor.getLayoutInfo()`, so a collapsed reading clips
every label to nothing while the fixed-size icons still draw. The editors do not
rely on Monaco's `automaticLayout` alone for this reason; see
[`monacoLayout.ts`](client/src/lib/monacoLayout.ts), which measures the container
and tells Monaco the answer. To confirm a suspected recurrence, check that
`monaco.editor.getEditors()[0].getLayoutInfo()` matches the editor's on-screen
size.

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

## Logging

Everything the app does — in the browser and on the server — is recorded, and
the two halves land in the same place.

**In the app:** `Ctrl+\`` (or "Open logs" in the command palette) opens a dock at
the bottom of the window showing both sides merged in time order. Filter by
level or text, click a line to expand its fields, and copy what's shown or
download the whole file. It stays open while you work, so the way to debug
something is usually to open it and do the thing again.

**On disk:** `server/logs/studio.log`, one JSON object per line, rotated at 5 MB
and keeping five files. `npm run logs` tails it.

```bash
npm run logs
```

Because it's NDJSON, questions get answered with ordinary tools:

```bash
grep '"l":"error"' server/logs/studio.log | tail -20
```

### Request ids

Every request gets a short id. It goes on the response as `x-request-id`, is
recorded by the browser against its own call, is stamped on every server line
produced while handling it, and is returned in the body of a 500. So a failure
someone reports resolves to one search:

```bash
grep '"reqId":"3b080005"' server/logs/studio.log
```

…which returns the browser's attempt, the request, the work it triggered
(storage writes, the apigeelint subprocess, the AI call) and the stack that
ended it, in order.

### Levels

Two of them, on purpose: the terminal shows `LOG_LEVEL` (default `info`) so it
stays readable, while the file and the in-app panel keep `LOG_FILE_LEVEL`
(default `debug`) so the detail you need when something breaks was already being
recorded before it broke. File writes are batched and off the request path, so
the verbose sink is also the cheap one.

Both can be changed without a restart, from the controls at the bottom of the
log panel. See `.env.example` for every setting.

### What is never written

Field names that mean "secret" (`apiKey`, `authorization`, `token`, `password`,
…) are replaced with `[redacted]` at any depth, as is the configured
`GEMINI_API_KEY` wherever it appears in a string. Records are bounded — depth,
array length, string length — so no log call can write a megabyte or follow a
cycle.

The AI code logs sizes, timings, models and HTTP statuses, and never prompt
content: the log is the artifact people paste into bug reports, and writing
prompts to it would reintroduce on disk exactly what
`server/src/lib/ai/guard.js` exists to prevent. A blocked payload is logged at
`fatal` — without the payload.

```bash
npm run test:logging
```
