import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Fetch only at development time. The deployed application uses local assets.
const repository = 'https://raw.githubusercontent.com/mixvlad/TarotCards/main';
const majors = {
  'rider-waite': ['Fool','Magician','High_Priestess','Empress','Emperor','Hierophant','Lovers','Chariot','Strength','Hermit','Wheel_of_Fortune','Justice','Hanged_Man','Death','Temperance','Devil','Tower','Star','Moon','Sun','Judgement','World'],
  marseille: ['Le_Mat','Le_Bateleur','La_Papesse','L_Imperatrice','L_Empereur','Le_Pape','L_Amoureux','Le_Chariot','La_Force','L_Ermite','La_Roue_de_Fortune','La_Justice','Le_Pendu','La_Mort','Temperance','Le_Diable','La_Maison_Dieu','L_Etoile','La_Lune','Le_Soleil','Le_Jugement','Le_Monde'],
};
async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
for (const theme of ['rider-waite', 'marseille']) {
  const directory = resolve('public', 'decks', theme);
  await mkdir(directory, { recursive: true });
  const extension = theme === 'marseille' ? 'png' : 'jpg';
  const entries = majors[theme].map((name, index) => {
    const sourceIndex = theme === 'marseille' ? (index === 8 ? 11 : index === 11 ? 8 : index) : index;
    return { id: `major-${String(index).padStart(2, '0')}`, file: `${String(sourceIndex).padStart(2, '0')}_${name}.${extension}` };
  });
  for (const [suit, prefix] of [['wands','Wands'],['cups','Cups'],['swords','Swords'],['pentacles','Pents']]) {
    for (let i = 1; i <= 14; i++) entries.push({ id: `${suit}-${String(i).padStart(2, '0')}`, file: `${prefix}${String(i).padStart(2, '0')}.${extension}` });
  }
  let completed = 0;
  const queue = [...entries];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const destination = resolve(directory, `${item.id}.webp`);
      try { await readFile(destination); } catch {
        const bytes = await get(`${repository}/tarot/${theme}/720px/${item.file}`);
        await sharp(bytes).resize({ height: 720, withoutEnlargement: true }).webp({ quality: 83 }).toFile(destination);
      }
      completed++;
    }
  }));
  await writeFile(resolve(directory, 'source-metadata.json'), await get(`${repository}/tarot/${theme}/metadata.json`));
  console.log(`${theme}: ${completed} cards ready (including semantic Strength/Justice mapping).`);
}
