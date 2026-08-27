import { nanoid } from 'nanoid';
import { normalizeSharedFlow } from './sharedFlowModel.js';
import { parser, text, asArray, parseSteps, extractRootTagName, collectBundleResources, readZip } from './xmlImportUtils.js';

// A Shared Flow bundle has no ProxyEndpoint/TargetEndpoint/RouteRule or
// conditional Flows — just a root <SharedFlowBundle> descriptor pointing at
// one <SharedFlow> file, which is itself a flat, ordered <Step> list.
export function importSharedFlowZip(buffer) {
  const { entries, entriesByPath } = readZip(buffer);

  const rootEntry = entries.find((e) => /(^|\/)sharedflowbundle\/[^/]+\.xml$/.test(e.entryName.replace(/\\/g, '/')));
  if (!rootEntry) {
    throw new Error("This doesn't look like a Shared Flow bundle — no sharedflowbundle/<name>.xml found.");
  }
  const normalizedRootPath = rootEntry.entryName.replace(/\\/g, '/');
  const prefix = normalizedRootPath.slice(0, normalizedRootPath.indexOf('sharedflowbundle/') + 'sharedflowbundle/'.length);

  const withinBundle = (subPath) =>
    entries.filter((e) => {
      const p = e.entryName.replace(/\\/g, '/');
      return p.startsWith(prefix + subPath) && p.slice((prefix + subPath).length).length > 0;
    });

  const rootXml = rootEntry.getData().toString('utf-8');
  const rootObj = parser.parse(rootXml)?.SharedFlowBundle;
  if (!rootObj) throw new Error('Root sharedflowbundle XML is not a valid <SharedFlowBundle> document.');

  const name = rootObj['@_name'] || rootEntry.entryName.replace(/^.*\//, '').replace(/\.xml$/, '');
  const description = rootObj.Description ? text(rootObj.Description) : '';

  // Policies — kept as their original raw XML verbatim; only the type (for
  // icon/label) and an optional resource file are inferred.
  const policyEntries = withinBundle('policies/').filter((e) => e.entryName.endsWith('.xml'));
  const policies = policyEntries.map((e) => {
    const policyName = e.entryName.replace(/\\/g, '/').split('/').pop().replace(/\.xml$/, '');
    const xml = e.getData().toString('utf-8');
    return {
      id: nanoid(10),
      name: policyName,
      type: extractRootTagName(xml),
      xml,
    };
  });

  // The flow file to read is whatever <SharedFlows><SharedFlow> names,
  // falling back to whichever sharedflows/*.xml file we actually found.
  const flowNames = asArray(rootObj.SharedFlows?.SharedFlow).map(text).filter(Boolean);
  const flowEntries = withinBundle('sharedflows/').filter((e) => e.entryName.endsWith('.xml'));
  const chosenFlowEntry =
    flowEntries.find((e) => e.entryName.replace(/\\/g, '/').endsWith(`/${flowNames[0]}.xml`)) || flowEntries[0];
  if (!chosenFlowEntry) {
    throw new Error('Missing the sharedflowbundle/sharedflows/*.xml flow descriptor.');
  }
  const flowRoot = parser.parse(chosenFlowEntry.getData().toString('utf-8'))?.SharedFlow;
  if (!flowRoot) throw new Error('Not a valid <SharedFlow> XML file.');
  const steps = parseSteps(flowRoot.Step);

  const resources = collectBundleResources(entries, entriesByPath, prefix);

  const sharedFlow = {
    id: nanoid(10),
    name,
    description,
    policies,
    steps,
    resources,
    lintExcludes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return normalizeSharedFlow(sharedFlow);
}
