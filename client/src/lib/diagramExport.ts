/**
 * Rasterises a live DOM subtree to a PNG, for "here's the proxy" in a design
 * doc or a PR.
 *
 * The technique is an SVG `<foreignObject>` wrapping a clone of the node: the
 * browser will paint arbitrary HTML into an image that way, but only if the
 * markup is fully self-contained. Nothing in the document's stylesheets comes
 * along, so every computed style has to be copied inline onto the clone first.
 *
 * Known limits, both cosmetic: webfonts aren't embedded (the SVG image runs in
 * its own document and can't reach the Google Fonts stylesheet), so text falls
 * back to the local sans/mono stack; and any external raster image inside the
 * node would taint the canvas. This app's diagram is HTML, inline SVG and text
 * only, so neither bites.
 */

/** Properties worth copying. The full computed set is ~340 per node — far too much markup. */
const COPIED_PROPERTIES = [
  'align-items',
  'background',
  'border',
  'border-radius',
  'box-shadow',
  'box-sizing',
  'color',
  'display',
  'flex',
  'flex-direction',
  'flex-shrink',
  'flex-wrap',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'gap',
  'grid-template-columns',
  'height',
  'justify-content',
  'letter-spacing',
  'line-height',
  'margin',
  'max-width',
  'min-height',
  'min-width',
  'opacity',
  'overflow',
  'padding',
  'position',
  'stroke',
  'stroke-dasharray',
  'stroke-width',
  'text-align',
  'text-transform',
  'top',
  'left',
  'right',
  'bottom',
  'white-space',
  'width',
  'fill',
];

function inlineStyles(source: Element, clone: Element) {
  const computed = window.getComputedStyle(source);
  const declarations: string[] = [];
  for (const property of COPIED_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) declarations.push(`${property}:${value}`);
  }
  // Animations would be captured mid-frame at an arbitrary point.
  declarations.push('animation:none', 'transition:none');
  clone.setAttribute('style', declarations.join(';'));

  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(clone.children);
  sourceChildren.forEach((child, i) => {
    const target = cloneChildren[i];
    if (target) inlineStyles(child, target);
  });
}

export async function nodeToPngBlob(node: HTMLElement, options: { background: string; scale?: number }): Promise<Blob> {
  const scale = options.scale ?? 2;
  const rect = node.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(rect.height);

  const clone = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, clone);
  // The clone is positioned by the foreignObject, not by the page layout.
  clone.style.position = 'static';
  clone.style.margin = '0';

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="100%" height="100%" fill="${options.background}"/>` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>` +
    `</foreignObject></svg>`;

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.width = width;
  image.height = height;

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The diagram could not be rendered to an image.'));
    image.src = url;
  });

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.scale(scale, scale);
  context.drawImage(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some builds.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
