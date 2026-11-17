export type ThemeId = 'rider-waite' | 'marseille';
export type SpreadId = 'single' | 'timeline' | 'choice' | 'celtic' | 'free';
export interface Point { x: number; y: number }
export interface Slot extends Point { id: string; label: string; angle: number; description?: string }
export interface Spread { id: SpreadId; name: string; subtitle: string; slots: Slot[] }

const majorNames = ['愚者','魔術師','女祭司','皇后','皇帝','教皇','戀人','戰車','力量','隱者','命運之輪','正義','倒吊人','死神','節制','惡魔','高塔','星星','月亮','太陽','審判','世界'];
const ranks = ['一','二','三','四','五','六','七','八','九','十','侍者','騎士','皇后','國王'];
export const cards = [
  ...majorNames.map((name, index) => ({ id: `major-${String(index).padStart(2, '0')}`, name })),
  ...Object.entries({ wands: '權杖', cups: '聖杯', swords: '寶劍', pentacles: '錢幣' }).flatMap(([suit, name]) =>
    ranks.map((rank, index) => ({ id: `${suit}-${String(index + 1).padStart(2, '0')}`, name: `${name}${rank}` }))),
];
export const cardNames = new Map(cards.map(card => [card.id, card.name]));
export const themes = [
  { id: 'rider-waite' as const, name: '偉特塔羅', english: 'Rider–Waite–Smith', note: '1909 · 經典敘事圖像', back: 'back-indigo.svg' },
  { id: 'marseille' as const, name: '馬賽塔羅', english: 'Tarot de Marseille', note: '法式傳統 · 木刻色彩', back: 'back-terracotta.svg' },
];
const slot = (id: number, label: string, x: number, y: number, angle = 0, description?: string): Slot => ({ id: String(id), label, x, y, angle, description });
export const spreads: Spread[] = [
  { id: 'single', name: '一張指引', subtitle: '留一個片刻，聽見當下', slots: [slot(1, '當下提示', 0, 0)] },
  { id: 'timeline', name: '時間之流', subtitle: '過去、現在，以及將要抵達的地方', slots: [slot(1, '過去', -150, 0), slot(2, '現在', 0, 0), slot(3, '未來', 150, 0)] },
  { id: 'choice', name: '兩條道路', subtitle: '讓兩個選擇，各自展開', slots: [slot(1, '現況', 0, 0), slot(2, 'A・助力', -155, -115), slot(3, 'A・挑戰', -155, 115), slot(4, 'B・助力', 155, -115), slot(5, 'B・挑戰', 155, 115)] },
  { id: 'celtic', name: '塞爾特十字', subtitle: '從當下出發，看見更完整的輪廓', slots: [
    slot(1, '現況', -100, 0, 0, '代表問題的現狀。'),
    slot(2, '影響因素', -100, 0, 90, '表示加在現況上的阻力或助力。橫放的牌，圖案的正面頂端朝右為正位，反之正面頂端朝左，則為逆位。'),
    slot(3, '理想', -100, -215, 0, '表示問卜者覺得最理想的狀況，或是對於事情的想法。'),
    slot(4, '基礎', -100, 215, 0, '表示目前已累積的成果或可以利用的資源，以及問題的成因。'),
    slot(5, '過去', -290, 0, 0, '問題的過去狀況。'),
    slot(6, '未來', 90, 0, 0, '表示問卜者未來會發生的事情。'),
    slot(7, '自我', 300, 285, 0, '問卜者本身的狀況。'),
    slot(8, '環境', 300, 95, 0, '表示外在環境因素或他人的觀點。'),
    slot(9, '希望或恐懼', 300, -95, 0, '表示問卜者希望發生或害怕發生的事情（正面的牌為希望發生，負面的牌為害怕發生）。'),
    slot(10, '結局', 300, -285, 0, '事情最終的結果。'),
  ] },
  { id: 'free', name: '自由牌桌', subtitle: '沒有固定的形狀，讓直覺帶路', slots: [] },
];
export const getSpread = (id: SpreadId) => spreads.find(spread => spread.id === id)!;
export const getTheme = (id: ThemeId) => themes.find(theme => theme.id === id)!;
const base = import.meta.env?.BASE_URL ?? '/';
export const faceUrl = (theme: ThemeId, cardId: string) => `${base}decks/${theme}/${cardId}.webp`;
export const backUrl = (theme: ThemeId) => `${base}decks/${getTheme(theme).back}`;
export const CARD_WIDTH = 100;
export const CARD_HEIGHT = 170;
