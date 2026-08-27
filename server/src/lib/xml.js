// Full escaping — safe for use inside a double-quoted attribute value.
export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Element text-content escaping — quotes/apostrophes don't need entities here,
// which keeps conditions like `request.verb = "GET"` readable in the exported XML.
export function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
