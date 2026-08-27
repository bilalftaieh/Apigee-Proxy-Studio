# Apigee Proxy Studio — Implementation Guide

Seven changes, scoped for a **single-user local tool** whose job is: build a proxy
here → export a zip → `Deploy > Import bundle` in the Apigee X console, and have it
work on the first request.

Ordered by dependency, not by value. Items 1–3 share one model walk and should land
as one push. Item 4 locks them in. Items 5–7 are independent and can be done in any
order afterwards.

| # | Feature | Touches | Rough size |
|---|---------|---------|------------|
| 1 | Resources as first-class files | generator, importer, model, new tab | L |
| 2 | Cross-reference validation | `deployChecks.js` | M |
| 3 | Deployment prerequisites manifest | new lib, new route, new panel | M |
| 4 | Round-trip fidelity harness | new test script | S |
| 5 | Diff / drift view | new lib, new modal | M |
| 6 | Flow-variable dataflow analysis | new lib, lint merge | L |
| 7 | Generated negative tests | new lib, Tests tab button | S |
| — | Small fixes | various | S |

A note on scope discipline, since this is a personal tool: none of these need
migration paths for your own on-disk JSON, feature flags, or config UI. Where a
constant in a file works, use a constant in a file. The existing
`normalizeProxy`/`normalizeVarValue` back-compat discipline in
[model.js](../server/src/lib/model.js) is more careful than a personal tool strictly
requires — keep it where it's already written, but don't feel obliged to extend it to
every new field you add below.

---

## 1. Resources as first-class files

### Problem

Resources are currently **owned by exactly one policy**. `Policy.resource` is a single
`{ path, content }` ([proxy.ts:179](../client/src/types/proxy.ts:179)),
`addPolicyFiles()` writes it while walking policies
([bundleGenerator.js:27](../server/src/lib/bundleGenerator.js:27)), and on import
`findPolicyResource()` finds a resource only by resolving the reference *inside* a
policy's XML ([xmlImportUtils.js:61](../server/src/lib/xmlImportUtils.js:61)).

Three concrete failures fall out of that:

**1a. Shared library files are unrepresentable.** The standard Apigee pattern is a
`resources/jsc/utils.js` helper pulled into several Javascript policies via
`<IncludeURL>jsc://utils.js</IncludeURL>`. `utils.js` belongs to no single policy, so
there is nowhere to put it. Your only workaround is to duplicate the code into every
policy's own resource file.

**1b. Orphan resources are silently dropped on import.** `bundleImporter.js` only ever
reaches resources through `findPolicyResource`. Import a real bundle containing
`resources/jsc/utils.js` (referenced by `IncludeURL`, not `ResourceURL`) or
`resources/properties/shared.properties`, and that file is not in the parsed proxy. It
then isn't in the export either — **data loss on round-trip, with no warning.**

**1c. The `<Resources>` manifest is hardcoded empty.**
[bundleGenerator.js:123](../server/src/lib/bundleGenerator.js:123) emits `<Resources/>`
even when the bundle contains resource files. Apigee tolerates this (it scans the
folders), but it means your bundle never byte-matches what Apigee's own export
produces, which makes item 5's diff noisy and item 4's harness impossible to make
strict.

### Solution

Promote resources to a **proxy-level collection**, and make `Policy.resource` a
*reference into* that collection rather than an owner of content. A resource is then
just a file in the bundle that zero or more policies point at.

### Step-by-step

**Step 1 — Model.** Add to `Proxy` in
[client/src/types/proxy.ts](../client/src/types/proxy.ts):

```ts
export interface BundleResource {
  id: string;
  /** Bundle-relative, always starts "resources/". e.g. "resources/jsc/utils.js" */
  path: string;
  content: string;
}
```

and `resources: BundleResource[]` on `Proxy`.

> **Superseded — coexistence was the wrong call.** This section originally said to
> leave `Policy.resource` in place alongside `Proxy.resources`, on the grounds that
> the policy-rename-renames-its-file behaviour in
> [policyXml.ts](../client/src/lib/policyXml.ts) was worth keeping. In practice that
> bought two editing surfaces for one kind of file, two code paths in both the
> generator and the importer, and a rename rule that is simply wrong once a file can
> be shared. `Policy.resource` is now folded into `Proxy.resources` by
> `foldPolicyResources` in [model.js](../server/src/lib/model.js) — a load-time
> migration, so every saved proxy, built-in template and importer path came along
> without changes. An Apigee bundle has no notion of a file belonging to a policy;
> there is only `resources/` and the XML references pointing into it. Modelling that
> directly turned out to be both smaller and more faithful.

**Step 2 — Normalizer.** In [model.js](../server/src/lib/model.js), add
`normalizeResources()` alongside the existing normalizers and call it from
`normalizeProxy`:

```js
function normalizeResources(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && typeof r.path === 'string' && r.path.startsWith('resources/'))
    .map((r) => ({ id: r.id || nanoid(), path: r.path, content: String(r.content ?? '') }));
}
```

Absent → `[]`, so every proxy on disk keeps generating byte-identical XML until you
actually add a resource. Same contract as the other normalizers.

**Step 3 — Generator.** In
[bundleGenerator.js](../server/src/lib/bundleGenerator.js):

- Add `addBundleResources(files, root, resources)` that runs `assertSafeRelPath` on
  each path and writes `files[`${root}/${r.path}`] = r.content`.
- Call it in `generateBundleFiles()` **before** `addPolicyFiles()`, so that if a policy
  and a shared resource collide on the same path the policy wins — matching today's
  precedence, where a user-edited `policy.resource` beats the type default.
- Replace the hardcoded `<Resources/>` in `buildRootProxyXml()` with a real manifest
  built from the final file map. This means `buildRootProxyXml` needs to know the
  resource paths, so pass them in:

```js
// <Resources> lists each resource as "<type>://<basename>", the same URI form
// policies use in <ResourceURL>. The type is the resources/<type>/ folder name.
function buildResourcesBlock(resourcePaths = []) {
  if (!resourcePaths.length) return '    <Resources/>';
  const refs = resourcePaths
    .map((p) => {
      const [, type, ...rest] = p.split('/');   // resources/jsc/utils.js
      return `        <Resource>${escapeXmlText(`${type}://${rest.join('/')}`)}</Resource>`;
    })
    .join('\n');
  return `    <Resources>\n${refs}\n    </Resources>`;
}
```

Restructure `generateBundleFiles` so the root XML is written *last*, after the file map
is complete — then derive the manifest from `Object.keys(files)` filtered to
`apiproxy/resources/`. That way the manifest can never drift from the actual files,
including the type-default resources that `addPolicyFiles` generates.

**Step 4 — Importer.** In [bundleImporter.js](../server/src/lib/bundleImporter.js),
after policies are parsed, sweep every zip entry under `<prefix>/resources/` and
collect any not already claimed as a `policy.resource` into `proxy.resources`. Build a
`Set` of claimed paths from the parsed policies first, then:

```js
const claimed = new Set(policies.map((p) => p.resource?.path).filter(Boolean));
const resources = [...entriesByPath.keys()]
  .filter((k) => k.startsWith(`${prefix}resources/`))
  .map((k) => k.slice(prefix.length))
  .filter((rel) => !claimed.has(rel))
  .map((rel) => ({ id: nanoid(), path: rel, content: readEntryText(rel) }));
```

This single change fixes 1b. Verify it with item 4's harness against a real bundle
exported from your own Apigee org.

**Step 5 — Shared flows.** `sharedflowbundle` supports resources identically. Mirror
steps 2–4 in [sharedFlowModel.js](../server/src/lib/sharedFlowModel.js),
[sharedFlowBundleGenerator.js](../server/src/lib/sharedFlowBundleGenerator.js) and
[sharedFlowBundleImporter.js](../server/src/lib/sharedFlowBundleImporter.js). Do this
in the same sitting — split across sessions it's guaranteed to be forgotten and become
a silent asymmetry.

**Step 6 — UI.** New `resources` entry in `TabKey`
([useStore.ts:27](../client/src/store/useStore.ts:27)) and in the `TABS` array
([ProxyEditor.tsx:16](../client/src/components/ProxyEditor.tsx:16)) — icon `folder-code`
fits the existing lucide set. The tab is a two-pane layout, the same shape as
`PoliciesTab`: file list on the left, Monaco on the right. Reuse `PreviewTab`'s Monaco
setup for the language-by-extension mapping (`.js` → javascript, `.py` → python,
`.xsl`/`.wsdl` → xml, `.yaml` → yaml, `.properties` → ini).

Store actions to add: `addResource(path)`, `updateResource(id, content)`,
`renameResource(id, path)`, `deleteResource(id)` — all trivially following the existing
`addPolicy`/`updatePolicy` pattern, each setting `dirty: true`.

Two UI affordances worth the effort:
- Validate the path on entry — must start `resources/`, must have a `resources/<type>/`
  segment, must not contain `..`. Reject inline rather than letting
  `assertSafeRelPath` throw a 400 at export time.
- Show, per resource, which policies reference it (grep policy XML for the
  `<type>://<basename>` URI). A resource nothing references is usually a mistake, and
  this is the cheap version of item 2's checking.

---

## 2. Cross-reference validation

### Problem

[deployChecks.js](../server/src/lib/deployChecks.js) is the right idea in the right
place — it catches states that "apigeelint passes but Apigee X cannot actually run",
exactly the failure mode that costs the most time. But it currently checks only
*intra-proxy scalar* things: name charset, base path shape, route rule
completeness, empty target URL, leftover `{PLACEHOLDER}` tokens.

Everything **reference-shaped** is unchecked, and those are precisely the ones that
import cleanly and fail at deploy or first request:

| Broken reference | What actually happens |
|---|---|
| `Step` names a policy not in `policies[]` | Deploy fails: "Policy X does not exist" |
| `FlowCallout` names a shared flow not deployed | Deploy fails, message names the shared flow, not the proxy |
| `RouteRule.targetName` names a nonexistent target | Deploy fails: unresolved target |
| `ResourceURL`/`IncludeURL` points at a missing resource | Deploy fails or JS throws at runtime |
| Policy referenced by nothing | Dead weight; usually a rename gone half-done |

The `Step` → policy case is the most common in practice, because deleting a policy in
the UI does not necessarily purge every step that referenced it, and apigeelint's own
check for this is not reliable across all flow positions.

### Solution

Extend `collectDeployBlockers` with a reference-resolution pass. Same output shape
(`{ filePath, ruleId, message, severity, line, column }`) so it flows into the Lint tab
and the existing export gate with **zero new plumbing** — that's the whole reason to
put it here rather than in a new module.

### Step-by-step

**Step 1 — Enumerate every step position once.** The single most useful helper in the
codebase. Add to `deployChecks.js`:

```js
// Every Step in the proxy, tagged with where it lives, so a reference check can
// name the exact flow a bad step is in. Order matters for item 6 (dataflow), so
// this walks in Apigee's real execution order.
export function* iterateSteps(proxy) {
  const pe = proxy.proxyEndpointName || 'default';
  const peFile = `apiproxy/proxies/${pe}.xml`;
  const emit = (steps, where, file) => (steps || []).map((s, i) => ({ step: s, where, file, index: i }));

  yield* emit(proxy.preFlow?.request, 'ProxyEndpoint PreFlow Request', peFile);
  for (const f of proxy.flows || []) yield* emit(f.request, `Flow "${f.name}" Request`, peFile);
  for (const t of proxy.targets || []) {
    const tf = `apiproxy/targets/${t.name}.xml`;
    yield* emit(t.preFlow?.request, `Target "${t.name}" PreFlow Request`, tf);
    for (const f of t.flows || []) yield* emit(f.request, `Target "${t.name}" Flow "${f.name}" Request`, tf);
    yield* emit(t.postFlow?.request, `Target "${t.name}" PostFlow Request`, tf);
    yield* emit(t.postFlow?.response, `Target "${t.name}" PostFlow Response`, tf);
    for (const f of t.flows || []) yield* emit(f.response, `Target "${t.name}" Flow "${f.name}" Response`, tf);
    yield* emit(t.preFlow?.response, `Target "${t.name}" PreFlow Response`, tf);
    yield* emit(t.faultRules?.steps, `Target "${t.name}" DefaultFaultRule`, tf);
    yield* emit(t.eventFlow?.response, `Target "${t.name}" EventFlow Response`, tf);
  }
  for (const f of proxy.flows || []) yield* emit(f.response, `Flow "${f.name}" Response`, peFile);
  yield* emit(proxy.postFlow?.response, 'ProxyEndpoint PostFlow Response', peFile);
  yield* emit(proxy.postClientFlow?.response, 'PostClientFlow Response', peFile);
  yield* emit(proxy.faultRules?.steps, 'ProxyEndpoint DefaultFaultRule', peFile);
}
```

Export it. Items 6 and 7 both consume it, and it's the difference between those being
"a day" and "an afternoon".

**Step 2 — DEPLOY006, dangling policy references.**

```js
const policyNames = new Set((proxy.policies || []).map((p) => p.name));
for (const { step, where, file } of iterateSteps(proxy)) {
  if (!policyNames.has(step.policyName)) {
    add(file, 'DEPLOY006',
      `${where} has a Step referencing policy "${step.policyName}", which does not exist in this proxy. Apigee rejects the bundle at deploy time.`);
  }
}
```

**Step 3 — DEPLOY007, unreferenced policies.** Invert the same set. Emit as
`severity: 'warning'` — an orphan policy is legal and deploys fine, so it must not
block export, but it's nearly always a leftover.

**Step 4 — DEPLOY008, shared flow references.** Parse the `<SharedFlowBundle>` element
out of each `FlowCallout` policy's XML, and check it against your locally saved shared
flows. This needs the shared flow list, which `collectDeployBlockers(proxy)` doesn't
have — so add an optional second parameter rather than reaching into storage from a
pure function:

```js
export function collectDeployBlockers(proxy, { knownSharedFlows = null } = {}) {
```

When `knownSharedFlows` is `null` (the shared-flow bundle path, and any caller that
hasn't been updated), skip the check entirely. In
[routes/lint.js](../server/src/routes/lint.js) and
[routes/bundle.js](../server/src/routes/bundle.js), load
`sharedFlowsStore.list()` and pass the names. Severity here is a judgement call:
**warning**, not error. The shared flow may legitimately already exist in your org
without existing in Studio, and blocking export on that would be wrong.

**Step 5 — DEPLOY009, missing resource references.** Now that item 1 gives you the
full resource path set, extract every `<ResourceURL>`, `<IncludeURL>`, `<OASResource>`
and `<ResourceURL>`-alike from policy XML, convert `jsc://utils.js` →
`resources/jsc/utils.js`, and check membership. Reuse the scheme→folder mapping already
written in [xmlImportUtils.js:47](../server/src/lib/xmlImportUtils.js:47) — export it
rather than duplicating it. This is an **error**: a missing resource is a hard deploy
failure.

**Step 6 — Wire the shared flow path.** `collectSharedFlowDeployBlockers` should get
the DEPLOY006/007/009 checks too, over its own step list. Factor the policy-reference
loop into a helper taking `(steps, policyNames)` so both call sites share it.

**Step 7 — Verify.** Fastest check: open a proxy, delete a policy that's used in a
flow, hit Lint. You should see DEPLOY006 naming the exact flow, and Export should be
blocked.

---

## 3. Deployment prerequisites manifest

### Problem

The zip is only half a deployment. The other half lives in the org/env and is
**invisible until the proxy fails**:

- **Target Servers** — `target.targetServers[]`. Ships as
  `<Server name="foo"/>`; if `foo` isn't defined in that environment the proxy deploys
  and then 503s on every call.
- **KeyStores / TrustStores** — `sslInfo.keyStore`, `keyAlias`, `trustStore`.
- **KVMs** — the `<MapIdentifier>` of every `KeyValueMapOperations` policy. A missing
  map is not a deploy error; it's an empty value at runtime, which then silently
  collapses to `""` in whatever consumed it.
- **Caches** — `<CacheResource>` in Populate/Lookup/InvalidateCache.
- **Service accounts** — `target.authentication` needs a service account bound at
  deploy time with the right IAM role on the backend.
- **Shared flows** — must be deployed to the environment *before* the proxy that calls
  them.
- **API Products / Developer Apps** — required for `VerifyAPIKey` or
  `OAuthV2 VerifyAccessToken` to ever succeed.

`deployChecks.js` already knows how to walk all of this. The console will never tell
you any of it. This is the highest-value item in the guide and the one with no
equivalent anywhere in GCP.

### Solution

A read-only **Prerequisites** panel: walk the proxy, produce a categorised list of
external artifacts it depends on, and render each with a copyable `apigeecli` command
that creates it. Not a deploy tool — a checklist you work through in the console or
CLI before importing.

### Step-by-step

**Step 1 — `server/src/lib/prerequisites.js`.** One exported function:

```js
/**
 * External org/environment artifacts this bundle depends on but does not contain.
 * Each: { kind, name, source, detail, cli }
 *   kind   — 'targetServer' | 'keystore' | 'truststore' | 'kvm' | 'cache'
 *          | 'serviceAccount' | 'sharedFlow' | 'apiProduct'
 *   source — where in the proxy it came from, for "why is this here?"
 *   cli    — apigeecli command template, or null where none applies
 */
export function collectPrerequisites(proxy) { /* ... */ }
```

Walk in this order, dedup by `${kind}:${name}`:

1. `proxy.targets[]` → `targetServer` for each entry in `targetServers`; `keystore` /
   `truststore` from `sslInfo`; `serviceAccount` when `authentication.mode !== 'none'`.
2. `proxy.policies[]`, dispatching on `policy.type` — parse the XML with the
   `fast-xml-parser` config already used in
   [policyExecutors.js:588](../server/src/lib/policyExecutors.js:588):
   - `KeyValueMapOperations` → `kvm` from `<MapIdentifier>`
   - `PopulateCache` / `LookupCache` / `InvalidateCache` → `cache` from
     `<CacheResource>` (skip when absent — that's the default shared cache, which
     always exists)
   - `FlowCallout` → `sharedFlow` from `<SharedFlowBundle>`
   - `VerifyAPIKey` / `OAuthV2` with `VerifyAccessToken` → `apiProduct`, name unknown,
     `detail` explaining an API Product must exist and include this proxy
3. Skip anything whose name is a `{variable}` — it's resolved at runtime and you can't
   name the artifact statically. Emit it as a `detail`-only advisory row instead so it
   isn't silently missing from the list.

**Step 2 — CLI templates.** Keep these in a `const CLI` map in the same file. Use
`$ORG` / `$ENV` placeholders and let the panel substitute values the user types:

```js
targetServer: (n) => `apigeecli targetservers create --name ${n} --host HOST --port 443 --enable=true --org $ORG --env $ENV --token $TOKEN`,
kvm:          (n) => `apigeecli kvms create --name ${n} --org $ORG --env $ENV --token $TOKEN`,
cache:        (n) => `apigeecli caches create --name ${n} --org $ORG --env $ENV --token $TOKEN`,
sharedFlow:   (n) => `apigeecli sharedflows import -f ./${n}.zip --org $ORG --token $TOKEN && apigeecli sharedflows deploy --name ${n} --org $ORG --env $ENV --token $TOKEN`,
```

`keystore`, `truststore`, `serviceAccount` and `apiProduct` get `cli: null` plus a
`detail` sentence — they need certificate material, IAM bindings, or product
configuration that a one-line template would misrepresent. Being honest here is worth
more than fake completeness.

**Step 3 — Route.** `POST /api/bundle/prerequisites` in `routes/bundle.js`, mirroring
the `/bundle/preview` shape exactly (including `applyEnvironmentOverrides`, so the list
reflects the environment you're about to export for — target servers in particular
differ per env, which is the entire point of `EnvironmentTargetOverride`).

**Step 4 — UI.** Rather than a ninth tab, put this in the **Lint tab** as a second
section below the lint results, since "can I ship this?" is one question. Group by
`kind`, one row each: name, source, a copy button for the CLI, and a checkbox whose
state lives in `localStorage` keyed by `${proxy.id}:${kind}:${name}`. The checkbox is
what makes it a usable checklist across sessions instead of a wall of text you re-read
every time.

Add a count badge to the Lint tab label, matching the existing `tab-count` pattern at
[ProxyEditor.tsx:95](../client/src/components/ProxyEditor.tsx:95).

**Step 5 — Export the checklist.** A "Copy all as shell script" button emitting every
non-null `cli` with `# --- keystores: create manually ---` comments for the rest. This
is what you'll actually paste into Cloud Shell.

**Step 6 — Deploy Set export.** Once shared flows are enumerated, add
`POST /api/bundle/export-set` that zips the proxy bundle **plus** each referenced
shared flow's bundle, plus a generated `README.txt` with the import order (shared flows
first). Add it to `ExportMenu`. Small change on top of the existing `sendZip`, and it
removes the "deployed the proxy, forgot the shared flow" failure entirely.

---

## 4. Round-trip fidelity harness

### Problem

26 importer/generator modules, no regression guard. `bundleImporter` and
`bundleGenerator` must be exact inverses, and nothing verifies that. Every feature you
add — resources being the immediate one — risks silently breaking a path you're not
currently looking at. For a tool whose entire output is *one artifact you paste into a
production console*, that's the wrong risk to carry.

### Solution

`import(export(P)) === P`, and `export(import(Z)) ≈ Z`, run as a single npm script.
Not a test framework — a script that exits nonzero. You're the only consumer.

### Step-by-step

**Step 1 — Corpus.** `server/test-bundles/`, gitignored. Populate with:
- Every built-in template from [seed/templates.js](../server/src/seed/templates.js) —
  free, already in code, and covers a wide policy spread.
- Real bundles exported from your own Apigee org. These are the valuable ones: they
  contain the XML shapes you didn't think of. Five or six is plenty.

**Step 2 — `scripts/roundtrip.mjs`.** Two directions.

*Generator→importer (model fidelity):*

```js
const files = generateBundleFiles(proxy);
const reparsed = await importBundleFromFiles(files);   // may need a files-map entry point
assertDeepEqual(stripVolatile(proxy), stripVolatile(reparsed));
```

`stripVolatile` drops `id`, `createdAt`, `updatedAt` and anything else regenerated per
parse. Keep that list *short and explicit* — every field you strip is a field this
harness stops protecting. If the list starts growing, that's a signal the importer is
lossy, not that the harness needs loosening.

`bundleImporter` currently takes a zip buffer. Refactor it to expose a files-map entry
point with the existing zip path as a thin wrapper — cleaner than making the harness
build zips in memory, and useful for item 5 too.

*Importer→generator (XML fidelity):*

```js
const proxy = await importBundle(zipBuffer);
const files = generateBundleFiles(proxy);
// compare against the zip's own entries, normalized
```

Compare **canonicalised** XML, not raw text: collapse whitespace between tags, sort
attributes, ignore comments. A tiny `canonicalizeXml()` using `fast-xml-parser`
(already a dependency) is enough. Aiming for byte-equality against Apigee's own
formatting is a trap — you'll spend a day on indentation and learn nothing.

**Step 3 — Report.** Print a per-bundle PASS/FAIL table and a unified diff for the
first mismatching file. Exit 1 on any failure.

**Step 4 — Wire it.** `"test:roundtrip": "node scripts/roundtrip.mjs"` in the root
`package.json`, next to the existing `lint:templates` script — same spirit, same place.

**Step 5 — Use it as the acceptance test for item 1.** Drop a bundle containing an
orphan `resources/jsc/utils.js` into the corpus *before* implementing item 1's
importer sweep. It should fail. Implement step 4 of item 1. It should pass. That's the
whole value of building this early.

---

## 5. Diff / drift view

### Problem

[storage.js](../server/src/lib/storage.js) keeps 20 rolling snapshots per proxy, and
`HistoryModal` can restore one — but you can't *see* what differs. Restore is
all-or-nothing on a proxy you can't inspect first, which makes the feature something
you avoid using.

The bigger gap: no way to compare **local vs what's actually deployed**. You export a
zip, import it, tweak something in the console three weeks later, forget, and your
local copy is now silently stale. Nothing surfaces that.

### Solution

Diff at the **generated-XML file level**, not the JSON model level. XML files are the
unit Apigee versions, the unit you'd inspect in the console, and the unit whose diffs
are readable. Two modes, one engine:

- **snapshot ↔ snapshot** (or snapshot ↔ current)
- **current ↔ imported bundle** — the drift check

### Step-by-step

**Step 1 — Diff engine.** `server/src/lib/bundleDiff.js`:

```js
/** Compares two file maps as produced by generateBundleFiles. */
export function diffBundles(leftFiles, rightFiles) {
  // → { added: [path], removed: [path], changed: [{ path, hunks }], unchanged: [path] }
}
```

For line diffs, add the `diff` package (small, no transitive deps) rather than writing
Myers yourself. Canonicalise both sides with item 4's `canonicalizeXml()` first, so
whitespace-only churn doesn't show up as a change.

**Step 2 — Route.** `POST /api/bundle/diff` taking `{ left, right }`, where each is
`{ proxy }` or `{ snapshotId }`. Server-side because both `generateBundleFiles` and the
snapshot store live there; sending 20 full proxy JSONs to the client to diff would be
backwards.

**Step 3 — Snapshot diff UI.** Extend `HistoryModal`: each row gets a "Diff vs current"
action opening a diff view. Use Monaco's built-in `DiffEditor` — you already ship
Monaco, so this is nearly free and gives you scroll-sync, inline/side-by-side toggle,
and folding for nothing. Left pane: file list with an add/remove/change marker per
file. Right: the diff.

This alone makes `HistoryModal` genuinely useful — you can see what a restore would do
before doing it.

**Step 4 — Drift check.** New action in `ImportProxyModal` (or its own menu entry):
"Compare with local proxy…". Drop in a zip downloaded from Apigee, pick the local proxy
to compare, render the same diff view. A header summary — *"3 files differ, 1 only in
Apigee, 0 only locally"* — is what you'll actually read most of the time.

**Step 5 — Optional, and genuinely optional.** Snapshot-on-export: stamp a snapshot
tagged `exported` (plus environment name) whenever `/bundle/export` succeeds. Then
"diff vs last export" answers "what have I changed since I last shipped?" without
having to remember which snapshot that was. Cheap, but skip it if item 5 is already
feeling long — the drift check is the part that earns its keep.

---

## 6. Flow-variable dataflow analysis

### Problem

Apigee resolves an unknown `{variable}` to the **empty string**, silently. No error, no
warning, no log line. This is the single largest class of "deploys fine, behaves wrong"
bug in Apigee development, and the only way to find it today is a live trace session in
the console — the slowest possible feedback loop, and the exact loop this tool exists to
replace.

`deployChecks.js` already catches one narrow instance: `{SHOUTY_SNAKE}` template
placeholders (DEPLOY005). The general case is unhandled:

- An `AssignMessage` reading `{customer.tier}` when nothing ever sets it.
- An `ExtractVariables` writing `auth.token`, and a downstream policy reading
  `auth.tokenn`.
- A condition on a variable that is only set by a policy running *later* in the flow —
  order-dependent, invisible in any per-file review.
- A variable set in a conditional flow that may not have executed, read
  unconditionally afterwards.

### Solution

Static dataflow over the ordered step list from item 2's `iterateSteps`. For each step,
compute the variables it **writes** and **reads**, walk in execution order maintaining a
"definitely set" and "maybe set" set, and flag reads not covered by either.

This is the most ambitious item here, so build it in the order below — each step is
independently useful, and you can stop at 3 and still have caught most real bugs.

### Step-by-step

**Step 1 — `server/src/lib/varFlow.js`, writer extraction.** Per policy type, which
variables does it set? Encode as a table, not clever inference:

```js
const WRITERS = {
  ExtractVariables: (xml) => /* <VariablePrefix> + each <Variable name="…"> */,
  AssignMessage:    (xml) => /* <AssignVariable><Name>, plus request.*/response.* mutations */,
  VerifyAPIKey:     (xml) => /* <Prefix> or "verifyapikey" + the documented fixed set */,
  ServiceCallout:   (xml) => /* <Response> name → <name>.content etc. */,
  LookupCache:      (xml) => /* <AssignTo> */,
  OAuthV2:          (xml) => /* oauthv2accesstoken.* on VerifyAccessToken */,
  Javascript:       () => null,   // opaque — see step 4
  // ...
};
```

Start with `ExtractVariables`, `AssignMessage`, `VerifyAPIKey`, `ServiceCallout`,
`LookupCache`. Those five cover the overwhelming majority. Add more as you hit them.

**Step 2 — Reader extraction.** Simpler and type-independent: every `{…}` in a policy's
XML, plus every identifier in a `Step`/`Flow` `<Condition>`. You already have a
condition parser in
[conditionEvaluator.js](../server/src/lib/conditionEvaluator.js) — reuse its tokenizer
rather than writing a second one. Filter out message-template function calls
(`{jsonPath(…)}`, `{createUuid()}`) — a trailing `(` after the identifier is a
sufficient test.

**Step 3 — Built-ins.** A `BUILTIN_VARS` set: `request.*`, `response.*`, `message.*`,
`client.*`, `system.*`, `organization.*`, `environment.*`, `apiproxy.*`, `proxy.*`,
`target.*`, `current.*`, `is.error`, `error.*`, `fault.*`. Prefix matching, not exact.
Get this list from Apigee's flow-variables reference and write it down once. **This
step is what makes the difference between a useful tool and one that cries wolf on
every proxy** — an over-eager analyzer you learn to ignore is worse than none.

**Step 4 — Walk and report.** Iterate `iterateSteps(proxy)` in order, maintaining
`definite` and `maybe` sets. A step inside a conditional `Flow`, or one carrying a
`<Condition>`, contributes to `maybe` only. Then:

- read ∉ `definite` ∪ `maybe` ∪ builtins → **warning**, DATA001, "…is read but never
  set. Apigee resolves unknown variables to an empty string."
- read ∈ `maybe` only → **info**, DATA002, "…is only set on a conditional path."
- written, never read → **info**, DATA003. Noisy by nature (things get written for
  logging, or read by JS); keep it at info or leave it out.
- An opaque writer (`Javascript`, `JavaCallout`, `PythonScript`) anywhere in the flow →
  suppress DATA001 for the rest of that flow, and say so once: "Javascript policy 'X'
  may set variables this analysis cannot see." A false-negative here is much cheaper
  than a false positive.

**Step 5 — Severity, and where it surfaces.** Merge into the lint result like the
DEPLOY rules, but **warnings and info only — never errors.** The analysis is heuristic;
it must never block an export. Add a filter toggle in `LintTab` so you can hide the
`DATA*` family when you're chasing something else.

**Step 6 — Calibrate.** Run it across every proxy you have. Every false positive is
either a missing builtin (step 3) or a missing writer (step 1). Fix those, not the
severity. If you can't get it quiet on your own real proxies, the feature isn't ready —
and knowing that is worth more than shipping it.

---

## 7. Generated negative tests

### Problem

`TestCase` and the simulator in [testRunner.js](../server/src/lib/testRunner.js) exist
and work — but every test is hand-written, so in practice you write the happy path and
stop. The failure modes that actually break in production are the unwritten ones:
missing API key, malformed payload, quota exceeded, backend 500, wrong content type.

`FlowContract` ([proxy.ts:49](../client/src/types/proxy.ts:49)) already describes each
flow's params, body and expected response. Everything needed to generate the negative
cases is already in the model.

### Solution

A "Generate negative tests" button that derives failure-path test cases from the flow
contracts and the policies actually present, appends them as normal `TestCase` records,
and leaves them fully editable. Generation, not a special test type — nothing new to
maintain.

### Step-by-step

**Step 1 — `server/src/lib/testGenerator.js`.** `generateNegativeTests(proxy)` →
`TestCase[]`, using item 2's `iterateSteps` to know which policies guard which flow.
Per flow, emit cases for:

- **Auth** — flow guarded by `VerifyAPIKey` / `OAuthV2`: request with the key/token
  omitted, and one with a malformed value. Assert `fault` and status 401.
- **Required params** — each `FlowParam` marked required, omitted in turn. Assert the
  fault your `RaiseFault` produces, or 400.
- **Body** — flow with a JSON `FlowBody`: send invalid JSON, and send valid JSON missing
  a required field.
- **Method** — a verb the flow's condition doesn't match, asserting it falls through to
  whatever handles unmatched requests. Catches a missing catch-all flow, which is a
  very common real omission.
- **Backend failure** — `MockTargetResponse` with status 500, asserting your fault
  handling actually engages rather than leaking the backend body.
- **Quota / SpikeArrest** — where those policies exist, seed
  `TestInitialState` past the limit and assert 429.

**Step 2 — Naming and idempotency.** Prefix generated names (`neg: missing api key`)
and set a `generated: true` flag on the `TestCase`. Regenerating replaces only
`generated` cases, never your hand-written or hand-edited ones. Clearing the flag on
first edit — so an edited test survives regeneration — is the right behaviour and is
about four lines.

**Step 3 — Route and UI.** `POST /api/bundle/generate-tests` returning the cases
(don't save server-side — let the store append them and mark `dirty`, consistent with
every other editing action). Button in `TestsTab` next to the existing add-test action,
plus a count in the confirmation toast.

**Step 4 — Run and triage.** Run the generated set. Expect failures — that's the point.
Each one is either a real gap in your fault handling or a wrong assumption in the
generator. Fix the former; delete the latter, and don't be precious about the generator
being right. It's a scaffold, not an oracle.

---

## Small fixes

**a. Move the export gate server-side.** `POST /api/bundle/export` runs
`collectDeployBlockers` ([bundle.js:79](../server/src/routes/bundle.js:79)) but **not
apigeelint** — the README documents this. So an export triggered any way other than the
UI button skips the lint gate entirely. Fix: call `lintProxy` in the export route and
409 on any `severity: 'error'`. Cost is a few seconds per export; apigeelint's first
run in a session is slow but subsequent ones are fine. Given that the whole purpose of
this tool is producing an artifact you paste into a production console, the gate should
not live only in the UI layer.

**b. Root XML metadata is already correct.** I flagged `<DisplayName>`/`<Description>`
and the `<Policies>` manifest as gaps in my earlier pass — they're all already emitted
correctly in `buildRootProxyXml`. The only real gap in that function is `<Resources/>`,
covered by item 1 step 3. Noted here so you don't go looking.

**c. `<TargetServers/>` in the root XML** is likewise hardcoded empty. Unlike
`<Resources>` this is *correct* — that element refers to a legacy bundle-scoped target
server definition that Apigee X doesn't use; env-level target servers don't belong
there. Leave it. Item 3 is where target servers get surfaced.

**d. Cache the apigeelint binary resolution across restarts.** `resolveApigeelintBin`
caches in-process only, and with `node --watch` in dev you pay the lookup on every
restart. Minor, but you'll restart hundreds of times while implementing the above.

---

## Suggested order

1. **Item 4** (harness) — first, deliberately. Build it against the current code so
   it's a real baseline, then every item below has an acceptance test.
2. **Item 1** (resources) — the model change everything else builds on.
3. **Item 2** (references) — `iterateSteps` unlocks 3, 6, 7.
4. **Item 3** (prerequisites) — highest value per hour once the walk exists.
5. **Small fix (a)** — ten minutes, closes a real hole.
6. **Item 5** (diff) — independent; do it when staleness starts biting.
7. **Item 7** (negative tests) — small, and its output tells you where your fault
   handling is thin.
8. **Item 6** (dataflow) — last, largest, and the one to abandon without guilt if step
   6's calibration won't go quiet.
