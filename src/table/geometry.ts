import { CARD_HEIGHT, CARD_WIDTH, type Point } from '../domain/catalog';
export interface Viewport { scale: number; x: number; y: number; fit: boolean }
export interface Positioned extends Point { angle: number }
export function bounds(items: Positioned[]) {
  if (!items.length) return { left: -230, right: 230, top: -130, bottom: 130 };
  const boxes = items.map(item => {
    const radians = item.angle * Math.PI / 180;
    const w = Math.abs(Math.cos(radians)) * CARD_WIDTH + Math.abs(Math.sin(radians)) * CARD_HEIGHT;
    const h = Math.abs(Math.sin(radians)) * CARD_WIDTH + Math.abs(Math.cos(radians)) * CARD_HEIGHT;
    return { left: item.x - w / 2, right: item.x + w / 2, top: item.y - h / 2, bottom: item.y + h / 2 };
  });
  return { left: Math.min(...boxes.map(b => b.left)), right: Math.max(...boxes.map(b => b.right)), top: Math.min(...boxes.map(b => b.top)), bottom: Math.max(...boxes.map(b => b.bottom)) };
}
export function fitViewport(items: Positioned[], width: number, height: number, maxScale = 1.55): Viewport {
  const box = bounds(items);
  const scale = Math.max(0.12, Math.min(maxScale, (width - 56) / (box.right - box.left + 60), (height - 64) / (box.bottom - box.top + 70)));
  return { scale, x: width / 2 - (box.left + box.right) / 2 * scale, y: height / 2 - (box.top + box.bottom) / 2 * scale, fit: true };
}
export function toWorld(point: Point, viewport: Viewport): Point { return { x: (point.x - viewport.x) / viewport.scale, y: (point.y - viewport.y) / viewport.scale }; }
export function zoomAt(viewport: Viewport, factor: number, origin: Point): Viewport {
  const scale = Math.max(0.12, Math.min(3.5, viewport.scale * factor));
  const ratio = scale / viewport.scale;
  return { scale, x: origin.x - (origin.x - viewport.x) * ratio, y: origin.y - (origin.y - viewport.y) * ratio, fit: false };
}
