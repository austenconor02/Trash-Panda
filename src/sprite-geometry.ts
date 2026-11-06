/** Source rectangles use pixels; alpha bounds are local to their atlas cell. */
export interface SpriteRect { x: number; y: number; width: number; height: number }
/** Anatomical landmarks use normalized cell coordinates, independent of trimming. */
export interface SpriteLandmark { headWidth: number; pivot: readonly [number, number]; floor?: number }
export interface SpriteFrameGeometry {
  crop: SpriteRect;
  scale: number;
  drawWidth: number;
  drawHeight: number;
  /** Scaled offsets from the cropped image's top-left to its anatomical root. */
  pivotX: number;
  pivotY: number;
  /** Scaled offset to the planted foot plane, when authored for a grounded pose. */
  floorY?: number;
}

/**
 * Trim transparent padding without resizing anatomy or moving the authored root.
 * In flight draw at (worldX - pivotX, worldY - pivotY). For a grounded frame draw
 * at groundY - floorY. Mirror the drawing around worldX; keep this geometry intact.
 */
export function buildSpriteFrame(cell: SpriteRect, bounds: SpriteRect, landmark: SpriteLandmark, displayHeadWidth: number): SpriteFrameGeometry {
  const values = [cell.x, cell.y, cell.width, cell.height, bounds.x, bounds.y, bounds.width, bounds.height, landmark.headWidth, ...landmark.pivot, displayHeadWidth];
  if (!values.every(Number.isFinite) || cell.x < 0 || cell.y < 0 || cell.width <= 0 || cell.height <= 0 || bounds.width <= 0 || bounds.height <= 0 || displayHeadWidth <= 0) throw new RangeError('Sprite rectangles and display size must be finite and positive.');
  const unit = (value: number) => value >= 0 && value <= 1;
  if (landmark.headWidth <= 0 || !unit(landmark.headWidth) || landmark.pivot.length !== 2 || !landmark.pivot.every(unit) || (landmark.floor !== undefined && (!Number.isFinite(landmark.floor) || !unit(landmark.floor)))) throw new RangeError('Sprite anatomy landmarks must be normalized cell coordinates.');
  const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y);
  const right = Math.min(cell.width, bounds.x + bounds.width), bottom = Math.min(cell.height, bounds.y + bounds.height);
  if (right <= x || bottom <= y) throw new RangeError('Sprite alpha bounds must overlap their atlas cell.');
  const scale = displayHeadWidth / (landmark.headWidth * cell.width);
  return {
    crop: { x: cell.x + x, y: cell.y + y, width: right - x, height: bottom - y },
    scale,
    drawWidth: (right - x) * scale,
    drawHeight: (bottom - y) * scale,
    pivotX: (landmark.pivot[0] * cell.width - x) * scale,
    pivotY: (landmark.pivot[1] * cell.height - y) * scale,
    ...(landmark.floor === undefined ? {} : { floorY: (landmark.floor * cell.height - y) * scale }),
  };
}
