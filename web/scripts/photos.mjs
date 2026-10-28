// Кадрирует и грейдит исходные фото из корня папки «Мотопрокат»,
// пишет AVIF/WebP в public/img и размытые превью в src/data/photos.json.
// Запуск: npm run photos
import sharp from 'sharp';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { recolor } from './seasons.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../..');
const OUT = path.resolve(here, '../public/img');
const DATA = path.resolve(here, '../src/data/photos.json');
const WIDTHS = [640, 1080, 1600, 2400];

// Общий грейд: сочный цвет, плотные тени, тёплые света
const BASE = {
  modulate: { saturation: 1.22, brightness: 1.03 },
  // чуть греем красный и зелёный, синий оставляем глубоким
  recomb: [
    [1.06, 0.0, -0.04],
    [0.0, 1.04, -0.02],
    [-0.03, 0.0, 1.0],
  ],
  // y = a*x + b: контраст вокруг середины тонов
  linear: [1.14, -17],
  sharpen: { sigma: 0.9, m1: 0.6, m2: 2.2 },
};

const MODES = {
  // ночная версия кадра для блока с фарой: темно, холодно, но не серо
  dusk: { modulate: { brightness: 0.42, saturation: 0.85 }, recomb: [[0.85, 0, 0], [0, 0.95, 0.05], [0, 0.08, 1.15]] },
  // тот же кадр в свете фары: тепло и ярко
  lit: { modulate: { brightness: 1.32, saturation: 1.25 }, recomb: [[1.12, 0.04, 0], [0.02, 1.04, 0], [0, 0, 0.86]] },
  // первый экран: под белым текстом кадр темнее и сочнее
  hero: { modulate: { brightness: 0.78, saturation: 1.3 }, recomb: [[1.04, 0, 0], [0, 1.06, 0], [0, 0, 0.94]] },
  // фон блока вопросов: глубже по тону, чтобы на нём читался светлый текст
  deep: { modulate: { brightness: 0.82, saturation: 1.12 }, recomb: [[1.04, 0, 0], [0, 1.02, 0], [0, 0.02, 0.96]] },
};

const BIKE = { file: 'Зеленый сбоку.JPG', crop: { left: 210, top: 900, width: 4454, height: 4454 }, flop: true };
const PHOTOS = [
  { id: 'hero', file: 'Лужа.jpg', mode: 'hero', alt: 'Райдер на электроэндуро пролетает лужу на лесной дороге под Смоленском' },
  { id: 'field', file: 'В поле.jpg', crop: { left: 300, top: 0, width: 1620, height: 1080 }, alt: 'Райдер на электромотоцикле в летнем поле' },
  { id: 'pair', file: '2 мотика.jpg', alt: 'Два электроэндуро в траве после квеста' },
  { id: 'bike-dusk', ...BIKE, mode: 'dusk', alt: 'Электроэндуро с включённой фарой в осеннем поле на закате' },
  { id: 'bike-lit', ...BIKE, mode: 'lit', alt: '' },
  { id: 'rest', file: 'photo_2026-10-23_21-56-52.jpg', soft: true, alt: 'Девушка отдыхает у электроэндуро в летнем поле после поездки' },
  { id: 'wx-summer', file: 'Погода.jpg', alt: 'Вид с руля электроэндуро на летнюю грунтовку между полей' },
  { id: 'wx-autumn', file: 'Погода.jpg', season: 'autumn', alt: '' },
  { id: 'wx-winter', file: 'Погода.jpg', season: 'winter', alt: '' },
  { id: 'wx-spring', file: 'Погода.jpg', season: 'spring', alt: '' },
  { id: 'hug', file: 'Обнимашки.jpg', crop: { left: 0, top: 450, width: 1080, height: 1350 }, alt: 'Гость обнимает мотоцикл на фоне заката' },
];

// sharp хранит по одной операции каждого типа, поэтому проходы идут через буфер
async function grade(ph) {
  let img = sharp(path.join(SRC, ph.file)).rotate();
  if (ph.crop) img = img.extract(ph.crop);
  if (ph.flop) img = img.flop();
  if (ph.season) {
    // сезон рисуем по пикселям до общего грейда
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    recolor(data, info.width, info.height, info.channels, ph.season);
    img = sharp(await sharp(data, { raw: info }).png().toBuffer());
  }
  // уже обработанные исходники (soft) получают только лёгкую подгонку под палитру
  let buf = ph.soft
    ? await img.modulate({ saturation: 1.06 }).linear(1.05, -6).toBuffer()
    : await img.modulate(BASE.modulate).recomb(BASE.recomb).toBuffer();
  if (!ph.soft) buf = await sharp(buf).linear(BASE.linear[0], BASE.linear[1]).sharpen(BASE.sharpen).toBuffer();
  const m = MODES[ph.mode];
  if (m) buf = await sharp(buf).modulate(m.modulate).recomb(m.recomb).toBuffer();
  return buf;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await mkdir(path.dirname(DATA), { recursive: true });
const manifest = {};

for (const ph of PHOTOS) {
  const master = await grade(ph);
  const { width, height } = await sharp(master).metadata();
  const widths = WIDTHS.filter((w) => w < width || (w === 2400 && width > 2400));
  if (width <= 2400) widths.push(width);
  for (const w of widths) {
    const r = sharp(master).resize({ width: w, kernel: 'lanczos3' });
    await r.clone().avif({ quality: 70, effort: 6, chromaSubsampling: '4:4:4' }).toFile(path.join(OUT, `${ph.id}-${w}.avif`));
    await r.clone().webp({ quality: 86, smartSubsample: true }).toFile(path.join(OUT, `${ph.id}-${w}.webp`));
  }
  // превью 32px: в браузере растягивается с размытием, без пикселей
  const lqip = await sharp(master).resize({ width: 32 }).blur(1.2).webp({ quality: 50 }).toBuffer();
  manifest[ph.id] = {
    w: width,
    h: height,
    widths,
    alt: ph.alt,
    lqip: `data:image/webp;base64,${lqip.toString('base64')}`,
  };
  console.log(`${ph.id}: ${width}x${height} → ${widths.join(', ')}`);
}

await writeFile(DATA, JSON.stringify(manifest, null, 2));
