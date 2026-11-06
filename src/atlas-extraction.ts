import type { SpriteRect } from './sprite-geometry';

interface Component { left: number; top: number; right: number; bottom: number; count: number; opaque: number }
const centerX = (part: Component) => (part.left + part.right) / 2;
const distance = (a: Component, b: Component) => Math.hypot(Math.max(0, a.left - b.right - 1, b.left - a.right - 1), Math.max(0, a.top - b.bottom - 1, b.top - a.bottom - 1));

/**
 * Read complete figures from a generated row, allowing hands/tails to cross the
 * nominal equal-cell seams. Does not change pixels or infer anatomical scale.
 */
export function extractAtlasRow(pixels: Uint8ClampedArray, sheetWidth: number, sheetHeight: number, row: number, rows: number, columns = 8): SpriteRect[] {
  if (![sheetWidth, sheetHeight, row, rows, columns].every(Number.isSafeInteger) || sheetWidth <= 0 || sheetHeight <= 0 || rows <= 0 || columns <= 0 || row < 0 || row >= rows || pixels.length < sheetWidth * sheetHeight * 4) throw new RangeError('Invalid sprite atlas dimensions or row.');
  const startY = Math.floor(row * sheetHeight / rows), endY = Math.floor((row + 1) * sheetHeight / rows);
  const height = endY - startY, cellWidth = sheetWidth / columns;
  const visited = new Uint8Array(sheetWidth * height), queue = new Int32Array(visited.length), components: Component[] = [];
  const alpha = (point: number) => pixels[((startY + Math.floor(point / sheetWidth)) * sheetWidth + point % sheetWidth) * 4 + 3];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || alpha(start) < 32) continue;
    let head = 0, tail = 1;
    const part: Component = { left: sheetWidth, top: height, right: -1, bottom: -1, count: 0, opaque: 0 };
    queue[0] = start; visited[start] = 1;
    while (head < tail) {
      const point = queue[head++], x = point % sheetWidth, y = Math.floor(point / sheetWidth);
      part.left = Math.min(part.left, x); part.right = Math.max(part.right, x);
      part.top = Math.min(part.top, y); part.bottom = Math.max(part.bottom, y);
      part.count++; if (alpha(point) >= 128) part.opaque++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= sheetWidth || ny < 0 || ny >= height) continue;
        const next = ny * sheetWidth + nx;
        if (!visited[next] && alpha(next) >= 32) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    components.push(part);
  }
  const isGuide = (part: Component) => {
    const width = part.right - part.left + 1, height = part.bottom - part.top + 1;
    return (width > cellWidth * 1.2 || height > (endY - startY) * 0.95) && Math.min(width, height) < 5;
  };
  const bodies = components.filter(part => !isGuide(part) && part.opaque >= Math.max(20, cellWidth * height * 0.01))
    .sort((a, b) => b.count - a.count).slice(0, columns).sort((a, b) => centerX(a) - centerX(b));
  if (bodies.length !== columns) throw new Error(`Sprite row ${row} contains ${bodies.length} distinct figures; expected ${columns}.`);
  for (let index = 1; index < bodies.length; index++) if (bodies[index - 1].right >= bodies[index].left) throw new Error(`Sprite row ${row} has overlapping figure bounds near frame ${index}.`);
  const merged = bodies.map(body => ({ ...body }));
  const bodySet = new Set(bodies), padding = cellWidth * 0.15;
  for (const part of components) {
    if (bodySet.has(part) || isGuide(part) || part.opaque < 3) continue;
    const nearest = bodies.map((body, index) => ({ body, index, gap: distance(part, body) })).sort((a, b) => a.gap - b.gap)[0];
    if (!nearest || nearest.gap > padding || part.count > nearest.body.count * 0.4) continue;
    const index = nearest.index;
    // Keep detached fingers/tail tips with their figure, while excluding the
    // neighboring figure and background scraps in the next figure's region.
    if ((index && part.left <= bodies[index - 1].right) || (index < bodies.length - 1 && part.right >= bodies[index + 1].left)) continue;
    const body = merged[index];
    body.left = Math.min(body.left, part.left); body.right = Math.max(body.right, part.right);
    body.top = Math.min(body.top, part.top); body.bottom = Math.max(body.bottom, part.bottom);
  }
  return merged.map((body, index) => {
    const previous = merged[index - 1], next = merged[index + 1];
    if (previous && previous.right >= body.left) throw new Error(`Sprite row ${row} has ambiguous detached artwork near frame ${index}.`);
    const leftLimit = previous ? Math.floor((previous.right + body.left + 1) / 2) : 0;
    const rightLimit = next ? Math.floor((body.right + next.left + 1) / 2) : sheetWidth;
    const left = Math.max(leftLimit, body.left - 2), right = Math.min(rightLimit, body.right + 3);
    const top = Math.max(0, body.top - 2), bottom = Math.min(height, body.bottom + 3);
    return { x: left, y: startY + top, width: right - left, height: bottom - top };
  });
}
