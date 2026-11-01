// Result title, drawn into a canvas texture and composited inside the WebGL
// frame (so canvas.captureStream recordings include it).
import * as THREE from 'three';

export class TitleOverlay {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.NoColorSpace; // composited in display space
    this.texture.premultiplyAlpha = true;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.title = '';
    this.sub = '';
    this.p = -1;
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.p = -1;
  }

  set(title, sub) {
    this.title = title;
    this.sub = sub;
    this.p = -1;
  }

  /** @param p reveal progress 0..1; returns alpha for the compositor */
  draw(p) {
    p = Math.min(1, Math.max(0, p));
    if (Math.abs(p - this.p) < 1e-4) return p;
    this.p = p;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (p <= 0 || !this.title) {
      this.texture.needsUpdate = true;
      return 0;
    }
    const e = 1 - Math.pow(1 - p, 3);
    const portrait = H > W;
    const unit = Math.min(H, W * 0.5625);

    // Title: sized for the screen, then shrunk if it would not fit the width.
    let size = Math.min(H * (portrait ? 0.075 : 0.125), W * (portrait ? 0.16 : 0.11));
    const track0 = 0.34 - 0.12 * e;
    ctx.save();
    ctx.font = `700 ${size}px Cinzel, Georgia, serif`;
    ctx.letterSpacing = '0px';
    const raw = ctx.measureText(this.title).width + this.title.length * size * 0.34;
    if (raw > W * 0.86) size *= (W * 0.86) / raw;
    const track = size * track0;
    const y = H * (portrait ? 0.1 : 0.135) + size * 0.24 + (1 - e) * unit * 0.012;
    ctx.font = `700 ${size}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${track}px`;
    // Canvas adds tracking after the last glyph too; recentre.
    const x = W / 2 + track / 2;
    const grad = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.45);
    grad.addColorStop(0, '#fff8de');
    grad.addColorStop(0.45, '#f6d27a');
    grad.addColorStop(0.55, '#e0a63e');
    grad.addColorStop(1, '#b8792a');
    ctx.globalAlpha = e;
    // Soft warm glow, then a faint dark halo for legibility over bright stars.
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = size * 0.35;
    ctx.fillStyle = grad;
    ctx.fillText(this.title, x, y);
    ctx.shadowColor = 'rgba(255,190,90,0.55)';
    ctx.shadowBlur = size * 0.5;
    ctx.fillText(this.title, x, y);
    ctx.shadowBlur = 0;
    ctx.fillText(this.title, x, y);
    ctx.restore();

    // Subtitle fades in slightly later.
    const p2 = Math.min(1, Math.max(0, (p - 0.25) / 0.75));
    if (p2 > 0) {
      const e2 = 1 - Math.pow(1 - p2, 3);
      let s2 = Math.max(12, size * 0.24);
      const sub = this.sub.toUpperCase();
      ctx.save();
      ctx.font = `500 ${s2}px Montserrat, Helvetica, Arial, sans-serif`;
      ctx.letterSpacing = '0px';
      const w2 = ctx.measureText(sub).width + sub.length * s2 * 0.5;
      if (w2 > W * 0.9) s2 *= (W * 0.9) / w2;
      const t2 = s2 * 0.5;
      ctx.font = `500 ${s2}px Montserrat, Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = `${t2}px`;
      ctx.globalAlpha = e2 * 0.92;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = s2 * 0.6;
      ctx.fillStyle = '#f3ece0';
      ctx.fillText(sub, W / 2 + t2 / 2, y + size * 0.72 + (1 - e2) * unit * 0.008);
      ctx.restore();
    }
    this.texture.needsUpdate = true;
    return 1;
  }
}
