import { cards, cardNames, getSpread, spreads, themes, type Point, type SpreadId, type ThemeId } from './catalog';

export type RandomSource = () => number;
export interface DrawCard { id: string; reversed: boolean }
export interface PlacedCard extends DrawCard, Point {
  slotId: string | null;
  angle: number;
  revealed: boolean;
  z: number;
}
export interface Reading {
  version: 1;
  spread: SpreadId;
  theme: ThemeId;
  reversals: boolean;
  remaining: DrawCard[];
  placed: PlacedCard[];
}
export const secureUint32: RandomSource = () => {
  if (!globalThis.crypto?.getRandomValues) throw new Error('此瀏覽器無法使用安全亂數，請換用新版瀏覽器。');
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
};
export function uniformInt(n: number, random: RandomSource = secureUint32): number {
  if (!Number.isInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError('Invalid range');
  const limit = Math.floor(2 ** 32 / n) * n;
  let value: number;
  do { value = random(); } while (value >= limit);
  return value % n;
}
export function shuffle<T>(input: readonly T[], random: RandomSource = secureUint32): T[] {
  const output = [...input];
  for (let i = output.length - 1; i > 0; i--) {
    const j = uniformInt(i + 1, random);
    [output[i], output[j]] = [output[j]!, output[i]!];
  }
  return output;
}
export function newReading(spread: SpreadId = 'timeline', theme: ThemeId = 'rider-waite', reversals = true, random: RandomSource = secureUint32): Reading {
  return { version: 1, spread, theme, reversals, placed: [], remaining: shuffle(cards, random).map(card => ({ id: card.id, reversed: reversals && uniformInt(2, random) === 1 })) };
}
export function shuffleRemaining(reading: Reading, random: RandomSource = secureUint32): Reading {
  return { ...reading, remaining: shuffle(reading.remaining, random).map(card => ({ ...card, reversed: reading.reversals && uniformInt(2, random) === 1 })) };
}
export function drawCard(reading: Reading, target?: string | Point): Reading {
  const next = reading.remaining[0];
  if (!next) return reading;
  const spread = getSpread(reading.spread);
  const available = spread.slots.filter(slot => !reading.placed.some(card => card.slotId === slot.id));
  const selected = typeof target === 'string' ? available.find(slot => slot.id === target) : available[0];
  if (reading.spread !== 'free' && !selected) return reading;
  const position = reading.spread === 'free' ? (typeof target === 'object' ? target : { x: 0, y: 0 }) : selected!;
  const placed: PlacedCard = { ...next, x: position.x, y: position.y, slotId: selected?.id ?? null, angle: selected?.angle ?? 0, revealed: false, z: Math.max(0, ...reading.placed.map(card => card.z)) + 1 };
  return { ...reading, remaining: reading.remaining.slice(1), placed: [...reading.placed, placed] };
}
export function editCard(reading: Reading, id: string, changes: Partial<Pick<PlacedCard, 'x' | 'y' | 'angle' | 'revealed' | 'z'>>): Reading {
  return { ...reading, placed: reading.placed.map(card => card.id === id ? { ...card, ...changes } : card) };
}
export function changeSpread(reading: Reading, id: SpreadId): Reading {
  const spread = getSpread(id);
  if (id === 'free') return { ...reading, spread: id, placed: reading.placed.map(card => ({ ...card, slotId: null })) };
  const bottom = Math.max(...spread.slots.map(slot => slot.y)) + 240;
  return {
    ...reading, spread: id,
    placed: reading.placed.map((card, index) => {
      const slot = spread.slots[index];
      const extra = index - spread.slots.length;
      return { ...card, slotId: slot?.id ?? null, x: slot?.x ?? (extra % 4 - 1.5) * 130, y: slot?.y ?? bottom + Math.floor(extra / 4) * 200, angle: slot?.angle ?? 0 };
    }),
  };
}

// Treat persisted data as untrusted: accept only a complete, consistent 78-card state.
export function validReading(value: unknown): value is Reading {
  if (!value || typeof value !== 'object') return false;
  const data = value as Reading;
  if (data.version !== 1 || !spreads.some(s => s.id === data.spread) || !themes.some(t => t.id === data.theme) || typeof data.reversals !== 'boolean') return false;
  if (!Array.isArray(data.remaining) || !Array.isArray(data.placed) || data.remaining.length + data.placed.length !== 78) return false;
  const all = [...data.remaining, ...data.placed];
  if (!all.every(card => card && cardNames.has(card.id) && typeof card.reversed === 'boolean')) return false;
  if (new Set(all.map(card => card.id)).size !== 78) return false;
  const slotIds = new Set<string>();
  return data.placed.every(card => {
    if (![card.x, card.y, card.angle, card.z].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e8) || typeof card.revealed !== 'boolean') return false;
    if (card.slotId === null) return true;
    if (typeof card.slotId !== 'string' || slotIds.has(card.slotId) || !getSpread(data.spread).slots.some(slot => slot.id === card.slotId)) return false;
    slotIds.add(card.slotId);
    return true;
  });
}
