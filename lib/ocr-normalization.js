// Repair common OCR transport artifacts without changing mathematical symbols.
// Used only for standalone statement uploads; existing solution OCR is unchanged.
export function normalizeStandaloneMath(value) {
  let text = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  text = text.replace(/\\\$/g, '$');
  const blocks = [];
  text = text.replace(/\$\$([^$]+?)\${1,2}|\$([^$]+?)\$/g, (_, display, inline) => {
    // OCR can return $$...$. Close it consistently; preserve adjacent $x$$y$.
    blocks.push(display !== undefined ? `$$${display}$$` : `$${inline}$`);
    return `\uE100${blocks.length - 1}\uE101`;
  });
  // TeX line breaks outside math belong to the surrounding prose, not MathJax.
  text = text.replace(/\\+n(?=\s|$|[A-ZĐÀ-Ỹ]|\uE100|\\)/g, '\n')
    .replace(/-?\\{2,}-?/g, '\n');
  return text.replace(/\uE100(\d+)\uE101/g, (_, index) => blocks[Number(index)]).trim();
}
