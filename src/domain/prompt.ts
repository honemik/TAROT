import { cardNames, getSpread, getTheme } from './catalog';
import type { PlacedCard, Reading } from './reading';

const result = (card?: PlacedCard) => !card ? '尚未抽牌'
  : !card.revealed ? '已抽牌，尚未揭牌'
  : `${cardNames.get(card.id)}（${card.reversed ? '逆位' : '正位'}）`;

export function buildReadingPrompt(reading: Reading): string {
  const spread = getSpread(reading.spread);
  const lines = [
    '請以繁體中文，依照以下塔羅牌陣與牌面結果進行解讀。',
    '',
    '## 占卜問題',
    '［請在此填入想詢問的問題與背景；若未提供，請作一般性解讀。］',
    '',
    '## 牌桌資訊',
    `牌陣：${spread.name}`,
    `牌組：${getTheme(reading.theme).name}`,
    `已抽牌：${reading.placed.length} 張；已揭牌：${reading.placed.filter(card => card.revealed).length} 張`,
    '',
    '## 各牌位結果',
  ];
  for (const slot of spread.slots) {
    lines.push(`${slot.id}. ${slot.label}`, ...(slot.description ? [`   牌位意義：${slot.description}`] : []),
      `   結果：${result(reading.placed.find(card => card.slotId === slot.id))}`);
  }
  const extra = reading.placed.filter(card => !spread.slots.some(slot => slot.id === card.slotId));
  if (reading.spread === 'free') lines.push('自由擺牌，以下依抽牌順序列出；座標向右為 x 正值、向下為 y 正值，沒有預設牌位意義。');
  else if (extra.length) lines.push('', '### 牌陣外的牌（依抽牌順序）');
  for (const [index, card] of extra.entries()) {
    lines.push(`${index + 1}. ${result(card)}；位置：x=${card.x}、y=${card.y}`);
  }
  if (reading.spread === 'free' && !extra.length) lines.push('尚未抽牌。');
  lines.push('', '## 解讀要求',
    '1. 逐一結合牌位意義、牌名與正逆位解讀，並說明牌與牌之間的關聯。',
    '2. 尚未抽牌或尚未揭牌的位置請標示資訊不足，不要猜測牌面或補抽牌。',
    '3. 自由擺牌或牌陣外的牌若沒有指定用途，請勿自行賦予固定牌位意義。',
    '4. 最後整理整體主題、值得留意的因素，以及具體可行的建議。',
    '5. 將解讀表達為可供參考的可能性，避免將未來結果說成必然。');
  return lines.join('\n');
}
