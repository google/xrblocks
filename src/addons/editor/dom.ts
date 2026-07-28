/** Tiny helper for building a DOM subtree without a template-string or
 * framework dependency -- `el('button', {className: 'accent'}, 'Spawn')`
 * instead of three lines of createElement/assign/append per node. Used
 * throughout the editor's panels, which each own and inject their own DOM
 * rather than requiring the consuming app's index.html to pre-declare it. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  Object.assign(element, props);
  for (const child of children) {
    element.append(child);
  }
  return element;
}
