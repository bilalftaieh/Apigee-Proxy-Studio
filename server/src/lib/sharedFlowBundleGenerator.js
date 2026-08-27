import { escapeXml, escapeXmlText, XML_HEADER } from './xml.js';
import { addPolicyFiles, addBundleResources, assertSafeSegment } from './bundleGenerator.js';

// Mirrors buildResourcesBlock in bundleGenerator.js — see there for why this
// is derived from the final file map rather than sharedFlow.resources directly.
function buildResourcesBlock(resourcePaths = []) {
  if (!resourcePaths.length) return '    <Resources/>';
  const refs = resourcePaths
    .map((p) => {
      const [, type, ...rest] = p.split('/');
      return `        <Resource>${escapeXmlText(`${type}://${rest.join('/')}`)}</Resource>`;
    })
    .join('\n');
  return `    <Resources>\n${refs}\n    </Resources>`;
}

function buildStepsXml(steps = [], indent = '    ') {
  if (!steps.length) return '';
  return steps
    .map((step) => {
      const cond = step.condition
        ? `\n${indent}    <Condition>${escapeXmlText(step.condition)}</Condition>`
        : '';
      return `${indent}<Step>\n${indent}    <Name>${escapeXmlText(step.policyName)}</Name>${cond}\n${indent}</Step>`;
    })
    .join('\n');
}

export function buildSharedFlowBundleRootXml(sharedFlow, resourcePaths = []) {
  const policyRefs = (sharedFlow.policies || [])
    .map((p) => `        <Policy>${escapeXmlText(p.name)}</Policy>`)
    .join('\n');

  return `${XML_HEADER}<SharedFlowBundle revision="1" name="${escapeXml(sharedFlow.name)}">
    <ConfigurationVersion majorVersion="4" minorVersion="0"/>
    <Description>${escapeXmlText(sharedFlow.description || '')}</Description>
    <DisplayName>${escapeXmlText(sharedFlow.displayName || sharedFlow.name)}</DisplayName>
    <Policies>
${policyRefs}
    </Policies>
    <SharedFlows>
        <SharedFlow>default</SharedFlow>
    </SharedFlows>
${buildResourcesBlock(resourcePaths)}
</SharedFlowBundle>`;
}

// A Shared Flow has no Request/Response split and no conditional flows of
// its own — it's a flat, ordered list of steps that runs in whatever
// context (request/response/fault) the calling FlowCallout placed it in.
export function buildSharedFlowXml(sharedFlow) {
  const steps = buildStepsXml(sharedFlow.steps, '    ');
  return `${XML_HEADER}<SharedFlow name="default">
${steps}
</SharedFlow>`;
}

// Returns a flat map of { "sharedflowbundle/relative/path": "file contents" }
// mirroring exactly what a `.zip` import into Apigee X expects for a Shared Flow.
export function generateSharedFlowBundleFiles(sharedFlow) {
  const files = {};
  const root = 'sharedflowbundle';

  assertSafeSegment(sharedFlow.name, 'shared flow name');

  files[`${root}/sharedflows/default.xml`] = buildSharedFlowXml(sharedFlow);

  addBundleResources(files, root, sharedFlow.resources);
  addPolicyFiles(files, root, sharedFlow.policies);

  const resourcesPrefix = `${root}/resources/`;
  const resourcePaths = Object.keys(files)
    .filter((p) => p.startsWith(resourcesPrefix))
    .map((p) => p.slice(root.length + 1))
    .sort();
  files[`${root}/${sharedFlow.name}.xml`] = buildSharedFlowBundleRootXml(sharedFlow, resourcePaths);

  return files;
}
