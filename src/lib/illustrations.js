'use strict';
// Generierte Produkt-Illustrationen (SVG), eingefärbt in der gewählten Artikelfarbe.
// Wird verwendet, solange für einen Artikel kein echtes Foto hochgeladen ist.

/** Verfügbare Grafik-Typen (products.illustration) – Auswahl im Backend */
const ILLUSTRATIONS = [
  { key: 'tshirt', label: 'T-Shirt' },
  { key: 'polo', label: 'Poloshirt' },
  { key: 'jersey', label: 'Trikot' },
  { key: 'tank', label: 'Tanktop / Singlet' },
  { key: 'longsleeve', label: 'Langarmshirt' },
  { key: 'hoodie', label: 'Kapuzenpullover' },
  { key: 'jacket', label: 'Trainingsjacke' },
  { key: 'halfzip', label: 'Trainingstop (Half-Zip)' },
  { key: 'vest', label: 'Weste' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'pants', label: 'Trainingshose' },
  { key: 'tights', label: 'Tights' },
  { key: 'socks', label: 'Stutzen / Socken' },
  { key: 'cap', label: 'Cap' },
  { key: 'beanie', label: 'Mütze' },
  { key: 'bag', label: 'Sporttasche' },
  { key: 'backpack', label: 'Rucksack' },
  { key: 'towel', label: 'Handtuch' },
];

// ------------------------------------------------------------------ Farb-Helfer
function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/** mischt Farbe mit Schwarz (amount > 0) bzw. Weiß (amount < 0) */
function shade(hex, amount) {
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(rgb(hex).map((v) => v + (target - v) * t));
}
function luminance(hex) {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
function distance(a, b) {
  const x = rgb(a), y = rgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}
function normalizeHex(value, fallback) {
  const s = String(value || '').trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(s) ? '#' + s.toLowerCase() : fallback;
}

// ------------------------------------------------------------------ Bausteine
// p = Palette: m (Haupt), s (Schatten), s2 (tiefer Schatten), hl (Licht), a (Akzent), o (Kontur), z (Reißverschluss/Details)
function palette(color, accent) {
  const lum = luminance(color);
  const o = lum > 0.8 ? '#9ba1ab' : shade(color, 0.45);
  let a = accent;
  if (distance(accent, color) < 40) a = lum > 0.5 ? shade(color, 0.35) : shade(color, -0.6); // Akzent sonst unsichtbar
  return {
    m: color,
    s: shade(color, lum > 0.8 ? 0.07 : 0.14),
    s2: shade(color, lum > 0.8 ? 0.13 : 0.26),
    hl: shade(color, -0.12),
    a,
    o,
    z: lum < 0.25 ? '#8a8d94' : '#2a2c31',
  };
}

const body = (p, d, extra = '') => `<path d="${d}" ${/\bfill=/.test(extra) ? '' : `fill="${p.m}" `}stroke="${p.o}" stroke-width="3" stroke-linejoin="round" ${extra}/>`;
const fillPath = (fill, d, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const line = (stroke, d, w = 4, extra = '') => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const groundShadow = (cx = 200, cy = 362, rx = 120) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="12" fill="#000" opacity=".07"/>`;
/** angedeuteter Vereinsdruck (Wappen) */
function logo(p, cx, cy, r = 12) {
  const inner = distance(p.a, '#ffffff') < 40 ? p.o : p.a;
  return `<g opacity=".95"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${p.o}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${inner}" opacity=".85"/></g>`;
}
function mirrorX(d) {
  // spiegelt Pfad-Koordinaten an x = 200 (nur absolute Befehle mit x,y-Paaren)
  return d.replace(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g, (_, x, y) => `${400 - Number(x)} ${y}`);
}
const both = (fn, d) => fn(d) + fn(mirrorX(d));

// ------------------------------------------------------------------ Oberteile
const TEE = 'M165 66 C176 94 224 94 235 66 L274 80 L344 134 L308 190 L274 170 L274 330 Q200 340 126 330 L126 170 L92 190 L56 134 L126 80 Z';
const LONG = 'M165 66 C176 94 224 94 235 66 L274 80 Q318 98 330 158 L350 300 L312 310 L292 196 L274 178 L274 330 Q200 340 126 330 L126 178 L108 196 L88 310 L50 300 L70 158 Q82 98 126 80 Z';

function torsoShading(p) {
  return fillPath(p.s, 'M246 172 L274 170 L274 330 Q262 333 246 333 Z', 'opacity=".9"') +
    fillPath(p.hl, 'M140 176 L156 176 L156 328 L140 327 Z', 'opacity=".5"');
}

const SHAPES = {
  tshirt(p) {
    return groundShadow() + body(p, TEE) + torsoShading(p) +
      fillPath(p.s, 'M126 170 L92 190 L100 176 L126 160 Z') + fillPath(p.s, 'M274 170 L308 190 L300 176 L274 160 Z') +
      line(p.a, 'M165 68 C176 96 224 96 235 68', 7) +
      both((d) => line(p.a, d, 5), 'M65 129 L99 184') +
      body(p, TEE, 'fill="none"') + logo(p, 240, 128);
  },

  polo(p) {
    return groundShadow() + body(p, TEE) + torsoShading(p) +
      both((d) => line(p.a, d, 5), 'M65 129 L99 184') +
      // Knopfleiste
      `<rect x="190" y="84" width="20" height="62" rx="3" fill="${p.s}" stroke="${p.o}" stroke-width="2"/>` +
      `<circle cx="200" cy="100" r="3.5" fill="${p.hl}" stroke="${p.o}"/><circle cx="200" cy="124" r="3.5" fill="${p.hl}" stroke="${p.o}"/>` +
      // Kragen
      body(p, 'M165 64 L200 92 L184 118 L148 80 Z') + body(p, 'M235 64 L200 92 L216 118 L252 80 Z') +
      line(p.a, 'M150 81 L184 114', 3) + line(p.a, 'M250 81 L216 114', 3) +
      line(p.o, 'M165 64 Q200 56 235 64', 3) +
      body(p, TEE, 'fill="none"') + logo(p, 242, 140);
  },

  jersey(p) {
    return groundShadow() + body(p, TEE) +
      // Seitenstreifen + Schulterstreifen
      both((d) => fillPath(p.a, d), 'M126 172 L140 174 L140 330 L126 329 Z') +
      both((d) => line(p.a, d, 9), 'M150 76 L63 138') +
      torsoShading(p) +
      // V-Ausschnitt
      fillPath(p.s2, 'M168 66 L200 110 L232 66 Q200 74 168 66 Z') +
      line(p.a, 'M166 66 L200 112 L234 66', 7) +
      both((d) => line(p.a, d, 5), 'M65 129 L99 184') +
      body(p, TEE, 'fill="none"') + logo(p, 242, 136) +
      `<text x="200" y="250" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="64" fill="${p.a}" opacity=".9">10</text>`;
  },

  tank(p) {
    const d = 'M158 62 Q200 112 242 62 L256 64 Q254 132 288 172 Q276 250 288 330 Q200 342 112 330 Q124 250 112 172 Q146 132 144 64 Z';
    return groundShadow() + body(p, d) +
      fillPath(p.s, 'M262 180 Q276 176 284 176 Q272 252 284 328 Q272 331 262 331 Q252 252 262 180 Z') +
      line(p.a, 'M158 64 Q200 114 242 64', 6) +
      line(p.a, 'M144 66 Q146 134 114 172', 5) + line(p.a, 'M256 66 Q254 134 286 172', 5) +
      line(p.a, 'M116 322 Q200 334 284 322', 4) +
      body(p, d, 'fill="none"') + logo(p, 234, 140, 11);
  },

  longsleeve(p) {
    return groundShadow() + body(p, LONG) + torsoShading(p) +
      fillPath(p.s, 'M126 178 L108 196 L112 170 L126 158 Z') + fillPath(p.s, 'M274 178 L292 196 L288 170 L274 158 Z') +
      both((d) => body(p, d, `fill="${p.a}"`), 'M50 300 L88 310 L86 326 L48 316 Z') +
      line(p.a, 'M165 68 C176 96 224 96 235 68', 7) +
      body(p, LONG, 'fill="none"') + logo(p, 240, 130);
  },

  hoodie(p) {
    const hood = 'M146 84 Q128 26 200 20 Q272 26 254 84 Z';
    return groundShadow() + body(p, hood, `fill="${p.s}"`) + body(p, LONG) + torsoShading(p) +
      // Kapuzenöffnung
      fillPath(p.s2, 'M162 72 Q200 132 238 72 Q228 46 200 44 Q172 46 162 72 Z', `stroke="${p.o}" stroke-width="3"`) +
      line(p.a, 'M162 72 Q200 132 238 72', 5) +
      // Kordeln
      line(p.a, 'M186 104 L182 168', 3) + line(p.a, 'M214 104 L218 168', 3) +
      `<circle cx="182" cy="171" r="4" fill="${p.a}"/><circle cx="218" cy="171" r="4" fill="${p.a}"/>` +
      // Kängurutasche
      body(p, 'M150 244 L250 244 L266 304 L134 304 Z', `fill="${p.s}"`) +
      line(p.o, 'M150 244 L134 304 M250 244 L266 304', 3) +
      // Bund + Bündchen
      fillPath(p.s2, 'M126 316 L274 316 L274 330 Q200 340 126 330 Z') +
      both((d) => body(p, d, `fill="${p.s2}"`), 'M50 300 L88 310 L86 326 L48 316 Z') +
      body(p, LONG, 'fill="none"') + logo(p, 240, 140, 11);
  },

  jacket(p) {
    return groundShadow() + body(p, LONG) + torsoShading(p) +
      // Paspeln an den Ärmeln
      both((d) => line(p.a, d, 4), 'M104 116 Q82 200 70 300') +
      both((d) => line(p.a, d, 4), 'M126 178 L126 326') +
      // Taschen-Reißverschlüsse
      both((d) => line(p.z, d, 3), 'M150 246 L160 292') +
      // Stehkragen
      body(p, 'M160 58 L240 58 L244 84 Q200 98 156 84 Z') +
      fillPath(p.a, 'M166 62 L234 62 L236 72 Q200 80 164 72 Z') +
      // Reißverschluss
      line(p.z, 'M200 90 L200 332', 3) +
      `<rect x="195" y="88" width="10" height="20" rx="3" fill="${p.z}"/>` +
      both((d) => body(p, d, `fill="${p.s}"`), 'M50 300 L88 310 L86 326 L48 316 Z') +
      body(p, LONG, 'fill="none"') + logo(p, 242, 136);
  },

  halfzip(p) {
    return groundShadow() + body(p, LONG) + torsoShading(p) +
      both((d) => line(p.a, d, 8), 'M150 72 Q90 110 72 170') +
      body(p, 'M162 56 L238 56 L242 82 Q200 94 158 82 Z') +
      fillPath(p.a, 'M166 60 L234 60 L236 70 Q200 78 164 70 Z') +
      line(p.z, 'M200 88 L200 158', 3) +
      `<rect x="195" y="86" width="10" height="20" rx="3" fill="${p.z}"/>` +
      both((d) => body(p, d, `fill="${p.s}"`), 'M50 300 L88 310 L86 326 L48 316 Z') +
      body(p, LONG, 'fill="none"') + logo(p, 242, 136);
  },

  vest(p) {
    const d = 'M160 58 L240 58 L244 82 L268 88 Q262 140 288 170 L288 330 Q200 342 112 330 L112 170 Q138 140 132 88 L156 82 Z';
    const quilts = [130, 168, 206, 244, 282].map((y) => line(p.s2, `M100 ${y} Q200 ${y + 8} 300 ${y}`, 2.5)).join('');
    return groundShadow() + `<defs><clipPath id="vb"><path d="${d}"/></clipPath></defs>` + body(p, d) +
      `<g clip-path="url(#vb)">${quilts}${fillPath(p.s, 'M262 150 L300 150 L300 340 L262 340 Z', 'opacity=".9"')}</g>` +
      // Armausschnitt-Paspel
      line(p.a, 'M134 90 Q140 140 114 168', 4) + line(p.a, 'M266 90 Q260 140 286 168', 4) +
      fillPath(p.a, 'M166 62 L234 62 L236 72 Q200 80 164 72 Z') +
      line(p.z, 'M200 84 L200 334', 3) + `<rect x="195" y="84" width="10" height="20" rx="3" fill="${p.z}"/>` +
      both((d2) => line(p.z, d2, 3), 'M140 250 L150 296') +
      body(p, d, 'fill="none"') + logo(p, 240, 128);
  },

  // ------------------------------------------------------------------ Hosen
  shorts(p) {
    const d = 'M112 96 L288 96 L314 298 L216 312 L200 196 L184 312 L86 298 Z';
    return groundShadow(200, 340, 130) + body(p, d) +
      fillPath(p.s, 'M252 120 L288 120 L314 298 L286 302 Z', 'opacity=".9"') +
      both((d2) => line(p.a, d2, 7), 'M291 124 L310 290') +
      both((d2) => line(p.a, d2, 4), 'M92 290 L182 302') +
      body(p, 'M110 92 L290 92 L292 122 L108 122 Z', `fill="${p.s}"`) +
      line(p.a, 'M196 120 L190 154 M204 120 L210 154', 3) +
      body(p, d, 'fill="none"') + logo(p, 132, 270, 10);
  },

  pants(p) {
    const d = 'M124 52 L276 52 L292 348 L216 354 L200 158 L184 354 L108 348 Z';
    return groundShadow(200, 366, 110) + body(p, d) +
      fillPath(p.s, 'M246 80 L276 80 L292 348 L262 350 Z', 'opacity=".9"') +
      both((d2) => line(p.a, d2, 5), 'M278 82 L292 340') +
      both((d2) => line(p.z, d2, 3), 'M272 306 L276 348') +
      body(p, 'M122 48 L278 48 L280 80 L120 80 Z', `fill="${p.s}"`) +
      line(p.a, 'M196 78 L190 116 M204 78 L210 116', 3) +
      body(p, d, 'fill="none"') + logo(p, 140, 120, 9);
  },

  tights(p) {
    const d = 'M140 52 L260 52 L270 122 Q262 240 252 352 L214 354 L200 154 L186 354 L148 352 Q138 240 130 122 Z';
    return groundShadow(200, 366, 80) + body(p, d) +
      fillPath(p.s, 'M240 90 L266 100 Q258 240 250 350 L232 352 Q240 240 240 90 Z', 'opacity=".9"') +
      both((d2) => line(p.a, d2, 4), 'M266 124 Q258 240 250 344') +
      body(p, 'M138 48 L262 48 L264 84 L136 84 Z', `fill="${p.s}"`) +
      body(p, d, 'fill="none"') + logo(p, 152, 116, 9);
  },

  socks(p) {
    const sock = 'M148 44 L214 44 L214 262 Q214 290 240 298 L304 318 Q334 330 328 356 Q320 380 288 374 L188 362 Q148 356 148 318 Z';
    const back = `<g transform="translate(36 -14)">${body(p, sock, `fill="${p.s}"`)}${fillPath(p.a, 'M150 64 L212 64 L212 76 L150 76 Z', 'opacity=".7"')}</g>`;
    return groundShadow(240, 372, 110) + back + body(p, sock) +
      fillPath(p.s, 'M190 46 L214 46 L214 262 Q214 290 240 298 L250 301 Q196 296 190 262 Z', 'opacity=".9"') +
      // Ferse und Spitze
      fillPath(p.s2, 'M148 318 Q148 356 188 362 L194 330 Q172 330 166 300 L148 300 Z') +
      fillPath(p.s2, 'M290 314 L304 318 Q334 330 328 356 Q320 380 288 374 L284 344 Q300 336 290 314 Z') +
      // Bund mit Ringeln
      body(p, 'M146 40 L216 40 L216 88 L146 88 Z', `fill="${p.s}"`) +
      fillPath(p.a, 'M148 56 L214 56 L214 64 L148 64 Z') + fillPath(p.a, 'M148 72 L214 72 L214 80 L148 80 Z') +
      body(p, sock, 'fill="none"');
  },

  // ------------------------------------------------------------------ Accessoires
  cap(p) {
    const crown = 'M92 240 Q88 116 200 106 Q312 116 308 240 Z';
    const brim = 'M92 236 Q52 252 48 286 Q130 306 232 272 Q280 256 308 236 Q200 260 92 236 Z';
    return groundShadow(190, 318, 140) + body(p, crown) +
      fillPath(p.s, 'M250 116 Q312 136 308 240 L262 240 Q268 160 250 116 Z', 'opacity=".9"') +
      line(p.s2, 'M200 108 Q170 160 168 240 M200 108 Q236 160 240 240', 3) +
      `<circle cx="200" cy="106" r="7" fill="${p.a}" stroke="${p.o}" stroke-width="2"/>` +
      body(p, brim, `fill="${p.s}"`) + line(p.a, 'M60 282 Q140 298 230 268', 3, 'opacity=".9"') +
      logo(p, 204, 182, 18);
  },

  beanie(p) {
    const dome = 'M112 262 Q104 104 200 94 Q296 104 288 262 Z';
    const ribs = [140, 170, 200, 230, 260].map((x) => line(p.s, `M${x} 110 Q${x + (x - 200) * 0.15} 190 ${x} 258`, 3)).join('');
    const cuffRibs = Array.from({ length: 15 }, (_, i) => line(p.s2, `M${116 + i * 12} 262 L${116 + i * 12} 314`, 2)).join('');
    return groundShadow(200, 340, 120) + body(p, dome) + ribs +
      fillPath(p.s, 'M252 108 Q296 130 288 262 L262 262 Q266 160 252 108 Z', 'opacity=".8"') +
      body(p, 'M104 252 L296 252 L300 318 L100 318 Z', `fill="${p.s}"`) + cuffRibs +
      fillPath(p.a, 'M102 276 L298 276 L298 290 L102 290 Z', 'opacity=".95"') +
      body(p, 'M104 252 L296 252 L300 318 L100 318 Z', 'fill="none"') + logo(p, 200, 216, 14);
  },

  bag(p) {
    const d = 'M66 176 Q66 146 98 146 L302 146 Q334 146 334 176 L334 300 Q334 324 310 324 L90 324 Q66 324 66 300 Z';
    return groundShadow(200, 338, 150) +
      line(p.z, 'M150 150 Q148 70 200 70 Q252 70 250 150', 12) + line(shade(p.z, -0.3), 'M150 150 Q148 76 200 76 Q252 76 250 150', 3, 'opacity=".5"') +
      body(p, d) +
      fillPath(p.hl, 'M80 160 L320 160 L320 176 L80 176 Z', 'opacity=".5"') +
      fillPath(p.a, 'M66 268 L334 268 L334 300 Q334 324 310 324 L90 324 Q66 324 66 300 Z') +
      // Endstücke
      body(p, 'M66 176 Q66 146 98 146 L104 146 L104 324 L90 324 Q66 324 66 300 Z', `fill="${p.s}"`) +
      body(p, 'M334 176 Q334 146 302 146 L296 146 L296 324 L310 324 Q334 324 334 300 Z', `fill="${p.s}"`) +
      line(p.z, 'M104 160 L296 160', 3) + `<rect x="270" y="156" width="16" height="9" rx="2" fill="${p.z}"/>` +
      `<rect x="138" y="140" width="22" height="14" rx="3" fill="${p.z}"/><rect x="240" y="140" width="22" height="14" rx="3" fill="${p.z}"/>` +
      body(p, d, 'fill="none"') + logo(p, 200, 220, 18);
  },

  backpack(p) {
    const d = 'M118 98 Q118 62 156 62 L244 62 Q282 62 282 98 L292 338 Q292 360 270 360 L130 360 Q108 360 108 338 Z';
    return groundShadow(200, 368, 110) +
      // Schultergurte hinten
      body(p, 'M96 120 Q80 220 96 330 L110 330 Q98 220 112 120 Z', `fill="${p.s2}"`) +
      body(p, 'M304 120 Q320 220 304 330 L290 330 Q302 220 288 120 Z', `fill="${p.s2}"`) +
      line(p.z, 'M180 62 Q180 34 200 34 Q220 34 220 62', 8) +
      body(p, d) +
      fillPath(p.s, 'M250 64 Q282 70 282 98 L292 338 Q292 358 274 360 L262 360 Q268 200 250 64 Z', 'opacity=".9"') +
      line(p.z, 'M128 110 Q200 92 272 110', 3) +
      // Fronttasche
      body(p, 'M138 214 L262 214 Q272 214 272 226 L276 330 Q276 342 264 342 L136 342 Q124 342 124 330 L128 226 Q128 214 138 214 Z', `fill="${p.s}"`) +
      line(p.a, 'M132 236 L268 236', 4) +
      fillPath(p.a, 'M118 300 L124 300 L124 330 L118 330 Z') + fillPath(p.a, 'M276 300 L282 300 L282 330 L276 330 Z') +
      body(p, d, 'fill="none"') + logo(p, 200, 158, 18);
  },

  towel(p) {
    const main = 'M86 172 L314 172 Q324 172 324 182 L324 312 Q324 324 312 324 L88 324 Q76 324 76 312 L76 182 Q76 172 86 172 Z';
    return groundShadow(200, 352, 150) +
      // zweites Tuch darunter
      `<rect x="66" y="300" width="268" height="44" rx="14" fill="${p.s}" stroke="${p.o}" stroke-width="3"/>` +
      fillPath(p.a, 'M68 326 L332 326 L332 334 L68 334 Z', 'opacity=".8"') +
      body(p, main) +
      Array.from({ length: 10 }, (_, i) => line(p.s, `M${96 + i * 23} 196 L${96 + i * 23} 270`, 1.5, 'opacity=".55"')).join('') +
      // Bordüre
      fillPath(p.a, 'M78 280 L322 280 L322 294 L78 294 Z') + fillPath(p.a, 'M78 300 L322 300 L322 306 L78 306 Z') +
      fillPath(p.s, 'M290 174 L314 174 Q324 174 324 184 L324 312 Q324 322 312 322 L290 322 Z', 'opacity=".6"') +
      body(p, main, 'fill="none"') +
      // Umschlag (Falte) oben
      `<rect x="70" y="146" width="260" height="44" rx="22" fill="${p.hl}" stroke="${p.o}" stroke-width="3"/>` +
      line(p.s, 'M96 178 Q200 186 304 178', 3, 'opacity=".7"') +
      logo(p, 200, 236, 20);
  },
};

/**
 * @param key    Typ aus ILLUSTRATIONS
 * @param color  Hauptfarbe "#rrggbb"
 * @param accent Akzentfarbe "#rrggbb"
 * @returns SVG-String (oder null bei unbekanntem Typ)
 */
function renderIllustration(key, color = '#1d3c9c', accent = '#ffffff') {
  const shape = SHAPES[key];
  if (!shape) return null;
  const p = palette(normalizeHex(color, '#1d3c9c'), normalizeHex(accent, '#ffffff'));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">${shape(p)}</svg>`;
}

module.exports = { ILLUSTRATIONS, renderIllustration };
