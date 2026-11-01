// Render pipeline:
//   1. scene -> MSAA HDR target (coin included when it is moving slowly)
//   2. fast coin: N sub-frame renders accumulated additively (true shutter motion blur)
//   3. composite -> HDR target, 4. bloom, 5. ACES tone map + grade + text -> screen
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { coinUniforms } from './coin.js';

export const COIN_LAYER = 1;

const quadVS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Pipeline {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4 });
    this.coinRT = new THREE.WebGLRenderTarget(1, 1, { ...opts });
    this.compRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });

    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.92);

    this.compQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, tCoin: { value: null }, uCoin: { value: 0 } },
        vertexShader: quadVS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tScene; uniform sampler2D tCoin; uniform float uCoin;
          varying vec2 vUv;
          void main() {
            vec4 s = texture2D(tScene, vUv);
            vec4 c = texture2D(tCoin, vUv) * uCoin; // premultiplied
            gl_FragColor = vec4(c.rgb + s.rgb * (1.0 - c.a), 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      })
    );

    this.finalQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tHDR: { value: null },
          tText: { value: null },
          uTextAlpha: { value: 0 },
          uTime: { value: 0 },
          uRes: { value: new THREE.Vector2(1, 1) },
          uVignette: { value: 0.32 },
          uGrain: { value: 0.035 },
          uFlash: { value: 0 },
        },
        vertexShader: quadVS,
        fragmentShader: /* glsl */ `
          uniform sampler2D tHDR; uniform sampler2D tText;
          uniform float uTextAlpha; uniform float uTime; uniform vec2 uRes;
          uniform float uVignette; uniform float uGrain; uniform float uFlash;
          varying vec2 vUv;
          float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
          void main() {
            vec2 uv = vUv;
            vec2 c = uv - 0.5;
            float r2 = dot(c, c);
            // Gentle lateral chromatic aberration towards the frame edges.
            vec2 off = c * r2 * 0.006;
            vec3 col;
            col.r = texture2D(tHDR, uv - off).r;
            col.g = texture2D(tHDR, uv).g;
            col.b = texture2D(tHDR, uv + off).b;
            col += uFlash;
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            vec3 o = gl_FragColor.rgb;
            // Cinematic grade: lift blacks slightly toward teal, warm highlights.
            float l = dot(o, vec3(0.299, 0.587, 0.114));
            o = mix(o, o * vec3(0.96, 1.0, 1.04), (1.0 - l) * 0.35);
            o = mix(o, o * vec3(1.03, 1.0, 0.96), l * 0.25);
            // Vignette (aspect aware).
            vec2 vc = c * vec2(uRes.x / uRes.y, 1.0);
            o *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(vc));
            // Title overlay (sRGB, premultiplied).
            vec4 t = texture2D(tText, uv) * uTextAlpha;
            o = t.rgb + o * (1.0 - t.a);
            // Film grain, luminance weighted so blacks stay clean.
            float g = hash(uv * uRes + fract(uTime * 7.31) * 100.0) - 0.5;
            o += g * uGrain * (0.35 + 0.65 * l);
            gl_FragColor = vec4(o, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      })
    );
  }

  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    this.coinRT.setSize(w, h);
    this.compRT.setSize(w, h);
    this.bloom.setSize(w, h);
    this.finalQuad.material.uniforms.uRes.value.set(w, h);
  }

  /**
   * @param blur  { samples, apply(i) } - apply(i) poses the coin for sub-frame i
   */
  render(scene, camera, coin, blur, dt, time) {
    const r = this.renderer;
    const samples = blur ? blur.samples : 1;
    const useAccum = samples > 1;

    // 1. Main scene.
    coin.layers.set(useAccum ? COIN_LAYER : 0);
    coin.traverse((o) => o.layers.set(useAccum ? COIN_LAYER : 0));
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(scene, camera);

    // 2. Motion-blurred coin.
    if (useAccum) {
      const bg = scene.background;
      scene.background = null;
      const prevMask = camera.layers.mask;
      camera.layers.set(COIN_LAYER);
      const prevAuto = r.autoClear;
      r.autoClear = false;
      r.setRenderTarget(this.coinRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      const mats = coin.userData.materials;
      for (const m of mats) {
        m.blending = THREE.CustomBlending;
        m.blendSrc = THREE.OneFactor;
        m.blendDst = THREE.OneFactor;
        m.blendEquation = THREE.AddEquation;
        m.blendSrcAlpha = THREE.OneFactor;
        m.blendDstAlpha = THREE.OneFactor;
        m.transparent = false;
      }
      coinUniforms.uWeight.value = 1 / samples;
      for (let i = 0; i < samples; i++) {
        blur.apply(i);
        r.clearDepth();
        r.render(scene, camera);
      }
      blur.apply(-1); // restore the shutter-centre pose
      coinUniforms.uWeight.value = 1;
      for (const m of mats) m.blending = THREE.NormalBlending;
      r.autoClear = prevAuto;
      camera.layers.mask = prevMask;
      scene.background = bg;
    }

    // 3. Composite.
    const cq = this.compQuad.material.uniforms;
    cq.tScene.value = this.sceneRT.texture;
    cq.tCoin.value = this.coinRT.texture;
    cq.uCoin.value = useAccum ? 1 : 0;
    r.setRenderTarget(this.compRT);
    this.compQuad.render(r);

    // 4. Bloom (adds into compRT).
    this.bloom.render(r, null, this.compRT, dt, false);

    // 5. Tone map + grade + overlay to screen.
    const fu = this.finalQuad.material.uniforms;
    fu.tHDR.value = this.compRT.texture;
    fu.uTime.value = time;
    r.setRenderTarget(null);
    this.finalQuad.render(r);
  }
}
