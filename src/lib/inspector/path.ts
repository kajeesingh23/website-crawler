/** Runs INSIDE the page: a short CSS address for the element, so it can be found again in a fresh page. */
export function pathOf(el: Element): string {
  if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(n.id)}`);
      break;
    }
    const tag = n.tagName.toLowerCase();
    const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n!.tagName) : [];
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(n) + 1})` : tag);
  }
  return parts.join(" > ");
}
