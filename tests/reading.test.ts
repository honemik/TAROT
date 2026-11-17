import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { cards, themes } from '../src/domain/catalog';
import { changeSpread, drawCard, editCard, newReading, shuffle, shuffleRemaining, uniformInt, validReading } from '../src/domain/reading';
import { bounds, fitViewport, toWorld, zoomAt } from '../src/table/geometry';

const zero = () => 0;
test('uniform integer rejects biased tail values and validates ranges', () => {
  const numbers = [0xffffffff, 0xfffffffe, 7];
  assert.equal(uniformInt(3, () => numbers.shift()!), 2);
  assert.equal(numbers.length, 1);
  assert.equal(uniformInt(1, zero), 0);
  assert.throws(() => uniformInt(0), RangeError);
});
test('Fisher–Yates preserves all inputs and can produce every permutation of 3 cards', () => {
  const permutations = new Set<string>();
  for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
    const choices = [a,b];
    permutations.add(shuffle([1,2,3], () => choices.shift()!).join(''));
  }
  assert.equal(permutations.size, 6);
});
test('a complete free reading draws 78 unique cards; 79th draw is a no-op', () => {
  let reading = newReading('free');
  for (let i = 0; i < 78; i++) {
    reading = drawCard(reading, { x: i * 20, y: 0 });
    assert.equal(reading.placed.length + reading.remaining.length, 78);
    assert.ok(validReading(reading));
  }
  assert.equal(new Set(reading.placed.map(card => card.id)).size, 78);
  assert.equal(drawCard(reading), reading);
});
test('targeted slots cannot be overwritten and filled presets stop drawing', () => {
  let reading = newReading('timeline', 'rider-waite', true, zero);
  reading = drawCard(reading, '2');
  assert.equal(reading.placed[0]!.slotId, '2');
  assert.equal(drawCard(reading, '2'), reading);
  reading = drawCard(drawCard(reading));
  assert.equal(reading.placed.length, 3);
  assert.equal(drawCard(reading), reading);
});
test('remaining shuffle leaves placed identities, directions and geometry unchanged', () => {
  const reading = drawCard(newReading('timeline'));
  const next = shuffleRemaining(reading);
  assert.deepEqual(next.placed, reading.placed);
  assert.deepEqual(new Set(next.remaining.map(card => card.id)), new Set(reading.remaining.map(card => card.id)));
  assert.ok(validReading(next));
});
test('reversal setting is independent of placement rotation and reveal state', () => {
  const reading = drawCard(newReading('single', 'rider-waite', false, zero));
  assert.ok(reading.remaining.every(card => card.reversed === false));
  const next = editCard(reading, reading.placed[0]!.id, { angle: 90, revealed: true });
  assert.equal(next.placed[0]!.reversed, false);
  assert.deepEqual(next.remaining, reading.remaining);
});
test('restoring an undo snapshot draws the same identity and orientation again', () => {
  const snapshot = newReading('free');
  const next = drawCard(snapshot);
  const repeated = drawCard(structuredClone(snapshot));
  assert.deepEqual(next, repeated);
});
test('changing spread preserves overflow and every card result', () => {
  let reading = newReading('free');
  for (let i = 0; i < 12; i++) reading = drawCard(reading);
  const next = changeSpread(reading, 'single');
  assert.equal(next.placed.length, 12);
  assert.equal(next.placed.filter(card => card.slotId === null).length, 11);
  assert.deepEqual(next.placed.map(({ id, reversed }) => ({ id, reversed })), reading.placed.map(({ id, reversed }) => ({ id, reversed })));
  assert.ok(validReading(next));
  assert.ok(changeSpread(next, 'free').placed.every(card => card.slotId === null));
});
test('persisted state rejects corruption, duplicate cards and invalid coordinates', () => {
  const reading = drawCard(newReading());
  assert.ok(validReading(reading));
  assert.equal(validReading({ ...reading, version: 8 }), false);
  assert.equal(validReading({ ...reading, remaining: reading.remaining.slice(1) }), false);
  const duplicate = structuredClone(reading); duplicate.remaining[0]!.id = duplicate.placed[0]!.id;
  assert.equal(validReading(duplicate), false);
  assert.equal(validReading(editCard(reading, reading.placed[0]!.id, { x: Infinity })), false);
});
test('zoom around a point leaves that world point stationary; rotated bounds fit', () => {
  const view = { x: 25, y: -50, scale: 1.2, fit: false };
  const point = { x: 180, y: 120 };
  const previous = toWorld(point, view);
  const after = toWorld(point, zoomAt(view, 1.7, point));
  assert.ok(Math.abs(previous.x - after.x) < 1e-8);
  assert.ok(Math.abs(previous.y - after.y) < 1e-8);
  const rotated = bounds([{ x: 0, y: 0, angle: 90 }]);
  assert.equal(Math.round(rotated.right - rotated.left), 170);
  const fit = fitViewport([{ x: 0, y: 0, angle: 90 }], 320, 240);
  assert.ok(fit.scale * 170 <= 320);
});
test('both bundled decks contain every canonical card', async () => {
  for (const theme of themes) for (const card of cards) {
    const image = await stat(new URL(`../public/decks/${theme.id}/${card.id}.webp`, import.meta.url));
    assert.ok(image.size > 1000, `${theme.id}/${card.id} missing or empty`);
  }
});
