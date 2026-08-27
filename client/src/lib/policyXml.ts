function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Best-effort rewrite of the root element's name="..." attribute and any
// <DisplayName>...</DisplayName> text that match the old policy name, so a
// rename/duplicate doesn't leave the XML's internal name out of sync with
// the file name — that mismatch is exactly what apigeelint's PO008 flags.
export function retargetPolicyXmlName(xml: string, oldName: string, newName: string): string {
  if (!xml) return xml;
  const escapedOld = escapeRegExp(oldName);
  let result = xml.replace(new RegExp(`name="${escapedOld}"`), `name="${newName}"`);
  result = result.replace(new RegExp(`<DisplayName>${escapedOld}</DisplayName>`), `<DisplayName>${newName}</DisplayName>`);
  return result;
}

// Sets (or inserts) a FlowCallout policy's <SharedFlowBundle> target, so
// picking a shared flow from a dropdown doesn't require hand-editing XML.
export function setSharedFlowBundleName(xml: string, name: string): string {
  const re = /<SharedFlowBundle>[^<]*<\/SharedFlowBundle>/;
  if (re.test(xml)) return xml.replace(re, `<SharedFlowBundle>${name}</SharedFlowBundle>`);
  return xml.replace(/<\/FlowCallout>/, `    <SharedFlowBundle>${name}</SharedFlowBundle>\n</FlowCallout>`);
}

// Resource paths are always "<dir>/<name><ext>" — swap just the basename.
export function retargetResourcePath(resourcePath: string, newName: string): string {
  const lastSlash = resourcePath.lastIndexOf('/');
  const dir = lastSlash >= 0 ? resourcePath.slice(0, lastSlash + 1) : '';
  const filename = lastSlash >= 0 ? resourcePath.slice(lastSlash + 1) : resourcePath;
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx) : '';
  return `${dir}${newName}${ext}`;
}

// Resource paths are "resources/<scheme>/<filename>" — the scheme segment
// doubles as the URI scheme most policy types reference the file with
// (jsc://, xsl://, wsdl://, ...). ReadPropertySet is the one exception,
// referencing its resource by plain filename via <PropertySet name="..."/>.
function resourceScheme(resourcePath: string): string {
  return resourcePath.split('/')[1] || '';
}

// User-driven rename of a resource file's full name (unlike
// retargetResourcePath, which only ever follows the policy's own name and
// keeps the original extension). Keeps the policy XML's reference to the
// file in sync so the rename doesn't silently break the export.
export function renameResourceFile(xml: string, resourcePath: string, newFilename: string): { xml: string; path: string } {
  const oldFilename = resourcePath.split('/').pop() || '';
  if (!xml || !newFilename || newFilename === oldFilename) return { xml, path: resourcePath };

  const dir = resourcePath.slice(0, resourcePath.length - oldFilename.length);
  const scheme = resourceScheme(resourcePath);
  const escapedOldFilename = escapeRegExp(oldFilename);
  const newXml =
    scheme === 'properties'
      ? xml.replace(new RegExp(`(<PropertySet\\s+name=")${escapedOldFilename}(")`), `$1${newFilename}$2`)
      : xml.replace(new RegExp(`(${escapeRegExp(scheme)}://)${escapedOldFilename}\\b`), `$1${newFilename}`);

  return { xml: newXml, path: `${dir}${newFilename}` };
}
