import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardNames } from '../src/domain/catalog';
import { buildReadingPrompt } from '../src/domain/prompt';
import { changeSpread, drawCard, editCard, newReading } from '../src/domain/reading';

test('prompt maps targeted draws to their slots and uses card reversal independently of rotation', () => {
  let reading = drawCard(newReading('celtic', 'rider-waite', false, () => 0), '2');
  const card = reading.placed[0]!;
  reading = editCard(reading, card.id, { revealed: true });
  const prompt = buildReadingPrompt(reading);
  assert.match(prompt, /牌陣：塞爾特十字/);
  assert.match(prompt, /1\. 現況\n[^\n]*\n   結果：尚未抽牌/);
  assert.ok(prompt.includes(`   結果：${cardNames.get(card.id)}（正位）`));
  assert.match(prompt, /2\. 影響因素/);
  assert.match(prompt, /3\. 理想/);
  assert.match(prompt, /10\. 結局/);
  reading.placed[0]!.reversed = true;
  assert.ok(buildReadingPrompt(reading).includes(`${cardNames.get(card.id)}（逆位）`));
});

test('prompt does not disclose unrevealed cards or the remaining deck', () => {
  const reading = drawCard(newReading('timeline', 'marseille', true, () => 0));
  const prompt = buildReadingPrompt(reading);
  assert.match(prompt, /牌組：馬賽塔羅/);
  assert.match(prompt, /已抽牌：1 張；已揭牌：0 張/);
  assert.match(prompt, /已抽牌，尚未揭牌/);
  for (const card of [...reading.placed, ...reading.remaining]) {
    assert.ok(!prompt.includes(cardNames.get(card.id)!));
  }
});

test('free layouts and overflow cards are retained without assigning invented slots', () => {
  let reading = newReading('free', 'rider-waite', false, () => 0);
  assert.match(buildReadingPrompt(reading), /尚未抽牌。/);
  reading = drawCard(reading, { x: -123, y: 456 });
  reading = editCard(reading, reading.placed[0]!.id, { revealed: true });
  reading = drawCard(reading, { x: 50, y: 60 });
  assert.match(buildReadingPrompt(reading), /位置：x=-123、y=456/);
  const changed = changeSpread(reading, 'single');
  const prompt = buildReadingPrompt(changed);
  assert.match(prompt, /1\. 當下提示/);
  assert.match(prompt, /### 牌陣外的牌（依抽牌順序）\n1\. 已抽牌，尚未揭牌/);
});
