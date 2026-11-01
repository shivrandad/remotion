// Environment map for the coin's reflections: the real star field and the
// current body below, plus large soft "light cards" (the trick every product
// and trailer shot uses so polished metal has something bright to mirror).
import * as THREE from 'three';

export class CoinEnvironment {
  constructor(renderer, starsTex) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene = new THREE.Scene();
    this.scene.background = starsTex;
    this.scene.backgroundIntensity = 0.6;

    // Softbox look: feathered edges and a falloff from top to bottom.
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const u = x / 255, v = y / 255;
        const edge = Math.min(u, 1 - u, v, 1 - v);
        const f = Math.min(1, edge / 0.18);
        const ff = f * f * (3 - 2 * f);
        const val = ff * (0.35 + 0.65 * Math.pow(1 - v, 1.3));
        const o = (y * 256 + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 255 * val;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    const soft = new THREE.CanvasTexture(c);
    const card = (w, h, color, intensity, pos) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), map: soft, side: THREE.DoubleSide })
      );
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      this.scene.add(m);
      return m;
    };
    // Big warm key behind/above the coin: what a flat-lying face mirrors back to the camera.
    this.key = card(30, 14, 0xffd9a8, 1.1, new THREE.Vector3(-3, 8, -18));
    // Warm front-left softbox.
    card(10, 8, 0xfff1dc, 3.2, new THREE.Vector3(-12, 6, 9));
    // Cool rim strip, right and behind.
    card(2.5, 18, 0xbfd8ff, 4.0, new THREE.Vector3(13, 2, -6));
    // Small hard kicker for sparkle on the reeding.
    card(1.2, 1.2, 0xffffff, 20, new THREE.Vector3(6, 10, 8));

    // The body below the coin (re-textured per body).
    this.groundMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    this.ground = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), this.groundMat);
    this.ground.scale.setScalar(60);
    this.scene.add(this.ground);
    // Horizon glow band (atmosphere colour).
    this.bandMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 4, 64, 1, true), this.bandMat);
    band.position.y = -2;
    this.scene.add(band);

    this.target = null;
  }

  /** @param body body definition with .envColor / .atmoColor / ground texture */
  update(body) {
    if (body) {
      this.groundMat.map = body.envMap || null;
      this.groundMat.color.copy(body.envGround || new THREE.Color(0.3, 0.3, 0.3));
      this.groundMat.needsUpdate = true;
      this.bandMat.color.copy(body.atmoColor || new THREE.Color(0, 0, 0)).multiplyScalar(body.envBand ?? 0.6);
      this.ground.visible = true;
    } else {
      this.ground.visible = false;
      this.bandMat.color.setRGB(0, 0, 0);
    }
    const rt = this.pmrem.fromScene(this.scene, 0, 0.1, 200);
    if (this.target) this.target.dispose();
    this.target = rt;
    return rt.texture;
  }
}
