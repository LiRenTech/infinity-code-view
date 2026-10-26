/** Character offsets refer to normalized source text, independent of syntax spans. */
export function sourceRange(element: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let position = 0;
  let startNode: Node | null = null, endNode: Node | null = null;
  let startOffset = 0, endOffset = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const length = node.textContent?.length ?? 0;
    if (!startNode && start >= position && start <= position + length) {
      startNode = node;
      startOffset = start - position;
    }
    if (end >= position && end <= position + length) {
      endNode = node;
      endOffset = end - position;
      break;
    }
    position += length;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
