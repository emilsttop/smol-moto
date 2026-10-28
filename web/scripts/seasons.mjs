// Перекраска летнего кадра «Погода.jpg» в другие сезоны по пикселям.
// Маски строятся по цвету и высоте в кадре: небо, растительность, дорога,
// а райдер, руки и руль (синие, тёмные и серые пиксели) остаются как есть.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsv2rgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

// плавный шум для разнообразия оттенков листвы
const noise = (x, y) =>
  (Math.sin(x * 0.021 + Math.sin(y * 0.017) * 2) + Math.sin(y * 0.029 + x * 0.006) + Math.sin((x + y) * 0.011)) / 6 + 0.5;

function classify(h, s, v, x, y, H) {
  const horizon = H * (0.4 + (x / (H * 1.78)) * 0.02);
  // синий костюм, перчатки, руль и тёмные детали мотоцикла не трогаем
  if (y > horizon && h > 195 && h < 270 && s > 0.3) return 'keep';
  if (y > H * 0.55 && (v < 0.2 || (s < 0.12 && v < 0.75))) return 'keep';
  if (y < horizon + H * 0.03 && (h > 185 && h < 250 ? true : s < 0.2 && v > 0.45)) return 'sky';
  if (h > 42 && h < 175 && s > 0.1) return 'veg';
  if (h >= 10 && h <= 42 && s > 0.12) {
    // грунтовка: трапеция от точки на горизонте до всей ширины внизу кадра; ниже середины всё дорога
    const W = H * 1.78;
    const onRoad = y > horizon + H * 0.14 || Math.abs(x - W * 0.49) < (y - horizon) * 1.5 + W * 0.01;
    return onRoad && y > horizon ? 'road' : 'field';
  }
  return 'other';
}

const SEASONS = {
  winter(h, s, v, kind, n) {
    if (kind === 'sky') { const l = clamp(v * 0.9 + 0.12); return hsv2rgb(212, s * 0.25, l); }
    if (kind === 'veg' || kind === 'field' || kind === 'road') {
      // светлое уходит под снег, тёмное (кроны, тени) становится заснеженным серо-синим
      const snow = clamp((v - 0.22) / 0.45);
      const base = hsv2rgb(210, 0.08, 0.92 + (v - 0.5) * 0.12);
      const dark = hsv2rgb(205, 0.18, 0.2 + v * 0.5 + n * 0.08);
      return base.map((c, i) => c * snow + dark[i] * (1 - snow));
    }
    if (kind === 'other') return hsv2rgb(h, s * 0.35, clamp(v * 1.05));
    return null;
  },
  autumn(h, s, v, kind, n) {
    if (kind === 'sky') return hsv2rgb(h, s * 0.45, v * 0.82);
    if (kind === 'veg') {
      // кроны в ржавчину и золото, самые тёмные остаются хвоей
      if (v < 0.22) return hsv2rgb(95, s * 0.6, v);
      const hue = 18 + n * 26 + (v > 0.55 ? 6 : 0);
      return hsv2rgb(hue, clamp(s * 1.25 + 0.15), clamp(v * 1.02));
    }
    if (kind === 'field') return hsv2rgb(30, clamp(s * 1.1), v * 0.85);
    if (kind === 'road') return hsv2rgb(h, clamp(s * 1.15), v * 0.72);
    return null;
  },
  spring(h, s, v, kind, n) {
    // мягко: новый цвет смешивается с оригиналом, чтобы не терялась фактура
    if (kind === 'sky') return { rgb: hsv2rgb(h, clamp(s * 1.08), clamp(v * 1.03)), k: 1 };
    if (kind === 'field' || (kind === 'veg' && h < 58 && v > 0.5)) {
      // жёлтые поля: молодые всходы
      return { rgb: hsv2rgb(74 + n * 10, clamp(s * 0.9 + 0.12), clamp(v * 0.95)), k: 0.8 };
    }
    if (kind === 'veg') return { rgb: hsv2rgb(84 + n * 12, clamp(s * 0.95), clamp(v * 1.08 + 0.02)), k: 0.75 };
    if (kind === 'road') return { rgb: hsv2rgb(h, clamp(s * 1.05), v * 0.84), k: 1 }; // влажная грунтовка
    return null;
  },
};

// data: raw RGB(A) буфер, меняется на месте
export function recolor(data, width, height, channels, season) {
  const fn = SEASONS[season];
  if (!fn) return data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const [h, s, v] = rgb2hsv(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      const kind = classify(h, s, v, x, y, height);
      if (kind === 'keep') continue;
      const res = fn(h, s, v, kind, noise(x, y));
      if (!res) continue;
      // сезон может вернуть { rgb, k }: k — доля нового цвета при смешивании с оригиналом
      const out = Array.isArray(res) ? res : res.rgb;
      const k = Array.isArray(res) ? 1 : res.k;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(clamp(out[c] * k + (data[i + c] / 255) * (1 - k)) * 255);
    }
  }
  return data;
}
