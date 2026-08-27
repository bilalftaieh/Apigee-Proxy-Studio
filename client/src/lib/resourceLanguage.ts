// Shared by PoliciesTab (a policy's own resource file) and ResourcesTab
// (proxy-level shared resources) — Monaco's language-by-extension mapping.
export function resourceLanguage(path: string): string {
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.js')) return 'javascript';
  if (path.endsWith('.xsl') || path.endsWith('.wsdl') || path.endsWith('.xsd')) return 'xml';
  if (path.endsWith('.graphql')) return 'graphql';
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
  if (path.endsWith('.properties')) return 'ini';
  return 'plaintext';
}
