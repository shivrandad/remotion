// Procedural coin surface maps: height fields drawn on a 2D canvas, processed in
// float precision (no 8-bit banding), then converted into tangent-space normal
// maps plus an AO/roughness/metalness (ORM) map and a subtle colour map.
import * as THREE from 'three';

const FACE = 2048;

function boxBlur(src, w, h, r) {
  // Separable box blur, run three times by the caller for a near-gaussian.
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * inv;
      const a = Math.min(w - 1, x + r + 1);
      const b = Math.max(0, x - r);
      acc += src[row + a] - src[row + b];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc * inv;
      const a = Math.min(h - 1, y + r + 1);
      const b = Math.max(0, y - r);
      acc += tmp[a * w + x] - tmp[b * w + x];
    }
  }
  return out;
}

function gaussian(src, w, h, r) {
  let a = boxBlur(src, w, h, r);
  a = boxBlur(a, w, h, r);
  return boxBlur(a, w, h, r);
}

function maskFromCanvas(draw, size = FACE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  draw(g, size);
  const d = g.getImageData(0, 0, size, size).data;
  const m = new Float32Array(size * size);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  return m;
}

function starPath(g, cx, cy, ro, ri, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Build maps for one face. `letter` is engraved (recessed) into a mirror field,
 * proof-coin style: polished field, frosted engraving, raised rim and beads.
 */
export function makeFaceMaps(letter, renderer) {
  const S = FACE;
  const half = S / 2;

  const letterMask = maskFromCanvas((g) => {
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `900 ${Math.round(S * 0.62)}px Cinzel, Georgia, serif`;
    const m = g.measureText(letter);
    const asc = m.actualBoundingBoxAscent;
    const desc = m.actualBoundingBoxDescent;
    g.fillText(letter, half, half + (asc - desc) / 2);
  });

  const starMask = maskFromCanvas((g) => {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = S * 0.39;
      starPath(g, half + Math.cos(a) * r, half + Math.sin(a) * r, S * 0.022, S * 0.009, a + Math.PI / 2);
      g.fill();
    }
    // Thin engraved guide circles framing the star ring.
    g.lineWidth = S * 0.003;
    for (const rr of [0.348, 0.432]) {
      g.beginPath();
      g.arc(half, half, S * rr, 0, Math.PI * 2);
      g.stroke();
    }
  });

  // Soft-walled engraving: blur the masks, then shape into a flat floor with chamfered walls.
  const letterSoft = gaussian(letterMask, S, S, 5);
  const starSoft = gaussian(starMask, S, S, 2);

  const hgt = new Float32Array(S * S);
  const frost = new Float32Array(S * S); // 1 where the surface is frosted (inside engravings)
  const beads = 110;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const r = Math.sqrt(dx * dx + dy * dy);
      let h = 0;
      // Very slight dish towards the centre (real coins are not perfectly flat).
      h -= 0.06 * (1 - Math.min(1, r * r));
      // Fine concentric lathe grain in the field.
      h += 0.0035 * Math.sin(r * S * 0.85);
      // Raised rim with a rounded inner slope.
      const rim = smooth(0.885, 0.93, r);
      h = h * (1 - rim) + rim * (1.0 - 0.15 * smooth(0.97, 1.0, r));
      // Beaded border just inside the rim.
      const ang = Math.atan2(dy, dx);
      const cell = (ang / (Math.PI * 2)) * beads;
      const fc = cell - Math.floor(cell) - 0.5;
      const along = fc * ((Math.PI * 2) / beads) * 0.86; // arc distance in face units
      const across = r - 0.86;
      const bd = Math.sqrt(along * along + across * across) / 0.0115;
      if (bd < 1) h = Math.max(h, 0.42 * Math.sqrt(1 - bd * bd));
      // Engravings.
      const L = smooth(0.18, 0.82, letterSoft[i]);
      const St = smooth(0.2, 0.8, starSoft[i]);
      h -= 0.55 * L + 0.3 * St;
      hgt[i] = h;
      frost[i] = Math.max(smooth(0.5, 0.95, letterSoft[i]), smooth(0.5, 0.95, starSoft[i]) * 0.8);
    }
  }

  const normal = new Uint8Array(S * S * 4);
  const orm = new Uint8Array(S * S * 4);
  const color = new Uint8Array(S * S * 4);
  const strength = 34; // slope gain: height units are ~0.5 over a few pixels
  for (let j = 0; j < S; j++) {
    // DataTexture row 0 is v = 0 (bottom), canvas row 0 is the top: flip.
    const y = S - 1 - j;
    const ym = Math.max(0, y - 1);
    const yp = Math.min(S - 1, y + 1);
    for (let x = 0; x < S; x++) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(S - 1, x + 1);
      const dhdu = (hgt[y * S + xp] - hgt[y * S + xm]) * 0.5;
      const dhdv = (hgt[ym * S + x] - hgt[yp * S + x]) * 0.5; // v up = canvas y down
      let nx = -dhdu * strength;
      let ny = -dhdv * strength;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const o = (j * S + x) * 4;
      normal[o] = (nx * 0.5 + 0.5) * 255;
      normal[o + 1] = (ny * 0.5 + 0.5) * 255;
      normal[o + 2] = (nz * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;

      const i = y * S + x;
      const depth = Math.max(0, -hgt[i]);
      const f = frost[i];
      const ao = 1 - Math.min(0.55, depth * 0.75);
      const grain = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
      const rough = 0.1 + f * 0.32 + Math.abs(grain) * 0.04 * (0.4 + f);
      orm[o] = ao * 255;
      orm[o + 1] = Math.min(1, rough) * 255;
      orm[o + 2] = 255;
      orm[o + 3] = 255;
      // Slightly deeper, warmer gold inside the engraving (old toning in recesses).
      const t = 1 - 0.18 * f;
      color[o] = 255 * t;
      color[o + 1] = 255 * (t - 0.05 * f);
      color[o + 2] = 255 * (t - 0.12 * f);
      color[o + 3] = 255;
    }
  }

  const aniso = renderer.capabilities.getMaxAnisotropy();
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { normalMap: mk(normal), ormMap: mk(orm), map: mk(color, true) };
}

/** Reeded (ridged) edge: ridges run across the band, fading out on the chamfers. */
export function makeEdgeMaps(renderer, ridges = 150, band = [0.13, 0.87]) {
  const W = 4096;
  const H = 64;
  const normal = new Uint8Array(W * H * 4);
  const orm = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    const m = smooth(band[0], band[0] + 0.06, v) * (1 - smooth(band[1] - 0.06, band[1], v));
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const ph = u * ridges * Math.PI * 2;
      // Sharpened sine: flat-topped ridges with narrow grooves.
      const s = Math.sin(ph);
      const slope = Math.sign(s) * Math.pow(Math.abs(s), 0.6) * 0.75 * m;
      const nx = -slope;
      const l = Math.hypot(nx, 1);
      const o = (j * W + i) * 4;
      normal[o] = ((nx / l) * 0.5 + 0.5) * 255;
      normal[o + 1] = 128;
      normal[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      normal[o + 3] = 255;
      const groove = Math.pow(Math.max(0, -Math.cos(ph)), 4) * m;
      orm[o] = (1 - 0.45 * groove) * 255;
      orm[o + 1] = (0.2 + 0.15 * groove) * 255;
      orm[o + 2] = 255;
      orm[o + 3] = 255;
    }
  }
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const mk = (data) => {
    const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    t.needsUpdate = true;
    return t;
  };
  return { normalMap: mk(normal), ormMap: mk(orm) };
}
