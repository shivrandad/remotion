import * as THREE from 'three';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/montserrat/500.css';
import './style.css';

import { createCoin, COIN_R, COIN_HALF, coinUniforms } from './coin.js';
import { CoinEnvironment } from './env.js';
import { BODIES, BODY_IDS, buildBody } from './bodies.js';
import { createContactShadow, createDust } from './fx.js';
import { TitleOverlay } from './overlay.js';
import { Pipeline, COIN_LAYER } from './post.js';
import { makePlan, smooth, clamp, lerp } from './timeline.js';
import { makeCameraRig } from './camera.js';
import { Sound } from './audio.js';
import { FlipRecorder } from './recorder.js';
import { coinToss, pickExcluding, rand01 } from './rng.js';

const params = new URLSearchParams(location.search);
const TEX = (f) => `${import.meta.env.BASE_URL}textures/${f}`;

// --- Renderer ---------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Shadow map is refreshed once per frame, not once per render() call (motion-blur samples).
renderer.shadowMap.autoUpdate = false;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);

const shared = {
  center: { value: new THREE.Vector3(0, -1000, 0) },
  sunDir: { value: new THREE.Vector3(-0.55, 0.62, 0.56).normalize() },
  time: { value: 0 },
};

const sun = new THREE.DirectionalLight(0xfff1e0, 2.6);
sun.position.copy(shared.sunDir.value).multiplyScalar(100);
sun.layers.enable(COIN_LAYER);
// Tight shadow frustum around the landing site: crisp, real contact shadows.
sun.position.copy(shared.sunDir.value).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 5, far: 60 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.015;
sun.shadow.radius = 3;
scene.add(sun);
scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0x9aa8c0, 0x1a1008, 0.18);
hemi.layers.enable(COIN_LAYER);
scene.add(hemi);

const pipeline = new Pipeline(renderer);
const overlay = new TitleOverlay();
pipeline.finalQuad.material.uniforms.tText.value = overlay.texture;

const sound = new Sound();
const recorder = new FlipRecorder(canvas);

const recDot = document.createElement('div');
recDot.className = 'rec';
document.body.appendChild(recDot);

// --- Sizing -----------------------------------------------------------------
let forced = null; // [w, h] while recording
let quality = 1; // dynamic resolution scale, lowered if the GPU falls behind
function resize() {
  let bw, bh;
  if (forced) {
    [bw, bh] = forced;
    renderer.setPixelRatio(1);
    renderer.setSize(bw, bh, false);
  } else {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const maxPix = 1920 * 1080 * 1.15 * quality * quality;
    const pr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(maxPix / (w * h)));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    bw = Math.round(w * pr);
    bh = Math.round(h * pr);
  }
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  pipeline.setSize(size.x, size.y);
  overlay.setSize(size.x, size.y);
  camera.aspect = size.x / size.y;
  // Keep at least ~50 degrees of horizontal view on tall/portrait screens.
  const minH = THREE.MathUtils.degToRad(50);
  camera.fov = Math.max(40, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / camera.aspect)));
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// --- Assets -----------------------------------------------------------------
async function loadStars() {
  const t = await new THREE.TextureLoader().loadAsync(TEX('8k_stars_milky_way.jpg'));
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

await Promise.all([
  document.fonts.load('900 64px Cinzel'),
  document.fonts.load('700 64px Cinzel'),
  document.fonts.load('500 64px Montserrat'),
]);
const stars = await loadStars();
scene.background = stars;
scene.backgroundIntensity = 1.0;
scene.backgroundRotation = new THREE.Euler(0.35, 0, 0.5);

const coin = createCoin(renderer);
coin.group.userData.materials = coin.materials;
coin.group.visible = false;
scene.add(coin.group);

const coinEnv = new CoinEnvironment(renderer, stars);
function setCoinEnv(tex) {
  for (const m of coin.materials) {
    m.envMap = tex;
    m.needsUpdate = true;
  }
}
setCoinEnv(coinEnv.update(null));

const shadow = createContactShadow();
shadow.mesh.visible = false;
scene.add(shadow.mesh);
const dust = createDust();
scene.add(dust.points);

// --- Bodies -----------------------------------------------------------------
const bodyCache = new Map();
function getBody(id) {
  if (!bodyCache.has(id)) bodyCache.set(id, buildBody(BODIES[id], renderer, shared));
  return bodyCache.get(id);
}
let current = null; // built body in the scene
let lastId = null;
let nextId = params.get('body') || pickExcluding(BODY_IDS, null) || BODY_IDS[0];
getBody(nextId);

function evictExcept(keep) {
  for (const [id, p] of bodyCache) {
    if (keep.includes(id)) continue;
    p.then((b) => b.dispose());
    bodyCache.delete(id);
  }
}

function applyBodyLook(body) {
  const def = body.def;
  const cloud = def.surface?.type === 'cloud';
  shadow.uniforms.uR.value = body.flatGround ? 1e6 : body.R;
  shadow.mesh.scale.setScalar(body.flatGround ? 0.45 : 1);
  shadow.uniforms.uStrength.value = def.kind === 'sun' ? 0.55 : 0.85;
  sun.color.set(def.light?.color ?? 0xfff1e0);
  sun.intensity = def.light?.intensity ?? 2.6;
  hemi.groundColor.set(def.kind === 'sun' ? 0xff7a20 : 0x1a1008);
  hemi.intensity = def.kind === 'sun' ? 0.9 : 0.18;
  coin.setHeat(0);
  renderer.toneMappingExposure = def.exposure ?? 1.0;
  coinUniforms.uSinkY.value = -100;
  // Impact particles: dust, ice glitter, cloud splash or solar plasma.
  const du = dust.uniforms;
  du.uColor.value.copy(body.dustColor);
  du.uDrag.value = def.dustDrag ?? 2.4;
  du.uGrav.value = def.dustGrav ?? 0.9;
  du.uSize.value = cloud ? 1.3 : def.ice ? 0.6 : 1;
  du.uLife.value = cloud ? 0.9 : 1;
  if (cloud) du.uColor.value.copy(body.groundColor).multiplyScalar(1.1);
  dust.points.material.blending = def.plasma ? THREE.AdditiveBlending : THREE.NormalBlending;
  dust.points.material.needsUpdate = true;
}

// --- Flip state --------------------------------------------------------------
let state = 'idle';
let plan = null;
let rig = null;
let t0 = 0;
let frozenT = params.has('t') ? parseFloat(params.get('t')) : null;

async function flip(opts = {}) {
  if (state === 'flipping' || state === 'loading') return;
  state = 'loading';
  sound.ensure();
  const result = opts.face || params.get('face') || coinToss();
  const id = opts.body || nextId;
  const body = await getBody(id);

  if (current && current !== body) scene.remove(current.root);
  if (current !== body) {
    scene.add(body.root);
    current = body;
    setCoinEnv(coinEnv.update(body));
  }
  const def = body.def;
  applyBodyLook(body);

  plan = makePlan(result, def.surface || { type: 'solid' }, [rand01(), rand01(), rand01()]);
  rig = makeCameraRig(plan, def);
  overlay.set(result === 'heads' ? 'HEADS' : 'TAILS', `Landed on ${def.name}`);
  coin.group.visible = true;

  if (recorder.armed) {
    forced = [parseInt(params.get('recw') || '1920', 10), parseInt(params.get('rech') || '1080', 10)];
    resize();
    recorder.start(sound.streamDest.stream);
  }
  sound.schedule(plan, def, (t) => (plan.spin(t) / Math.PI));
  t0 = performance.now();
  state = 'flipping';
  document.body.classList.add('flipping');
  updateRecDot();

  // Pre-pick and preload the next body so it is resident before the next click.
  lastId = id;
  nextId = params.get('body') || pickExcluding(BODY_IDS, lastId) || lastId;
  evictExcept([lastId, nextId]);
  getBody(nextId);
}

function finish() {
  state = 'done';
  document.body.classList.remove('flipping');
  if (recorder.recording) {
    recorder.stop(`coinflip-${plan.result}-${current.def.id}-${Date.now()}.webm`).then(() => {
      forced = null;
      resize();
      updateRecDot();
    });
  }
}

function updateRecDot() {
  recDot.className = 'rec' + (recorder.recording ? ' on' : recorder.armed ? ' armed' : '');
}

// --- Input ------------------------------------------------------------------
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) flip();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    flip();
  } else if (e.code === 'KeyF') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  } else if (e.code === 'KeyR') {
    if (!recorder.recording) recorder.armed = !recorder.armed;
    updateRecDot();
  }
});

// --- Per-frame evaluation --------------------------------------------------------
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camTgt = new THREE.Vector3();

function poseCoin(t) {
  plan.coinPose(t, pos, quat);
  coin.group.position.copy(pos);
  coin.group.quaternion.copy(quat);
}

function evaluate(t) {
  if (!plan) {
    // Idle: an empty, slowly drifting star field.
    camera.position.set(0, 10.6, 9.5);
    camera.lookAt(0, 10.9, 0);
    scene.backgroundRotation.y = performance.now() * 0.00001;
    overlay.draw(0);
    pipeline.finalQuad.material.uniforms.uTextAlpha.value = 0;
    return;
  }
  poseCoin(t);
  const def = current.def;

  // Body rises into view, then turns slowly.
  const rise = smooth(0.5, 1.75, t);
  const riseE = 1 - Math.pow(1 - rise, 3);
  current.root.position.y = -(def.riseDepth ?? 120) * (1 - riseE);
  current.root.visible = t > 0.35;
  current.update(t);
  current.sphere.getWorldPosition(shared.center.value);

  // Camera.
  rig(t, camPos, camTgt);
  camera.position.copy(camPos);
  camera.lookAt(camTgt);

  // Stars drift, faster while time is slowed.
  scene.backgroundRotation.y = 0.2 + t * 0.012 + smooth(0.3, 1.5, t) * 0.05;

  // Contact shadow.
  up.set(0, 1, 0).applyQuaternion(quat);
  const tilt = Math.acos(Math.min(1, Math.abs(up.y)));
  const low = pos.y - (COIN_R * Math.sin(tilt) + COIN_HALF * Math.cos(tilt));
  shadow.uniforms.uCoin.value.copy(pos);
  shadow.uniforms.uLow.value = Math.max(0, low - Math.min(0, current.root.position.y));
  shadow.uniforms.uOffset.value.set(-shared.sunDir.value.x, -shared.sunDir.value.z).multiplyScalar(0.45);
  shadow.mesh.position.y = current.root.position.y;
  shadow.mesh.visible = def.surface?.type !== 'cloud' && t > 1.2;
  shared.time.value = t + 40;

  // Dust.
  dust.uniforms.uTime.value = t;
  if (def.dust || def.splash) {
    dust.uniforms.uBurstT.value.set(plan.tImp, plan.tBounceLand);
    dust.uniforms.uBurstS.value.set(1, 0.45);
  } else dust.uniforms.uBurstT.value.set(1e3, 1e3);
  dust.uniforms.uScale.value = pipeline.sceneRT.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

  // Body-specific per-frame effects (heat, sinking...).
  current.flipUpdate?.(t, plan, coin);

  // Title.
  const p = (t - plan.textStart) / 0.95;
  const ta = overlay.draw(p);
  pipeline.finalQuad.material.uniforms.uTextAlpha.value = ta;
  pipeline.finalQuad.material.uniforms.uTextOffset.value = (1 - ta) * 0.012;
}

let last = performance.now();
let last0 = last;
// Dynamic resolution: if frames run long for a while, render fewer pixels.
let slowFrames = 0;
let fastFrames = 0;
function adaptQuality(ms) {
  if (forced || document.hidden || ms > 250) return;
  if (ms > 19) slowFrames++;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (ms < 13) fastFrames++;
  else fastFrames = 0;
  if (slowFrames > 20 && quality > 0.55) {
    quality = Math.max(0.55, quality * 0.85);
    slowFrames = 0;
    resize();
  } else if (fastFrames > 240 && quality < 1 && state !== 'flipping') {
    quality = Math.min(1, quality / 0.85);
    fastFrames = 0;
    resize();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 1 / 240, 1 / 24);
  last = now;
  let t = 0;
  if (plan) {
    t = frozenT ?? (now - t0) / 1000;
    if (state === 'flipping' && frozenT === null && t > plan.duration) finish();
    if (state === 'done' && frozenT === null) t = Math.min(t, plan.duration + 600);
  }
  evaluate(t);

  // Shutter-accurate motion blur on the coin (180 degree shutter).
  let blur = null;
  if (plan && t < plan.tImp + 0.02) {
    const shutter = (frozenT !== null ? 1 / 60 : dt) * 0.5;
    const ang = plan.spin(t) * shutter;
    const lin = plan.linearSpeed(t) * shutter;
    const samples = clamp(Math.ceil(Math.max(ang / 0.024, lin / 0.035)), 1, 20);
    if (samples > 1) {
      blur = {
        samples,
        apply: (i) => {
          if (i < 0) poseCoin(t);
          else poseCoin(t + shutter * (i / (samples - 1) - 0.5));
          coin.group.updateMatrixWorld(true);
        },
      };
    }
  }
  renderer.shadowMap.needsUpdate = true;
  pipeline.render(scene, camera, coin.group, blur, dt, now / 1000);
  adaptQuality(now - last0);
  last0 = now;
}

resize();
requestAnimationFrame(frame);

// Hooks for automated screenshots / scripted recording.
window.__app = {
  flip,
  seek: (t) => (frozenT = t),
  play: () => {
    frozenT = null;
    t0 = performance.now();
  },
  get state() {
    return state;
  },
};
if (params.has('auto')) flip();
document.body.classList.add('ready');
