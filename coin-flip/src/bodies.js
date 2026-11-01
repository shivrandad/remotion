// Celestial bodies. Each one is built around a landing site at the world
// origin: the planet's centre sits at (0, -R, 0) so the coin lands on (0,0,0).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './noise.js';
import { coinUniforms } from './coin.js';

const TEX = (f) => `${import.meta.env.BASE_URL}textures/${f}`;

const ROCKY_DETAIL = { albedo: 0.32, bump: 1.0 };

export const BODIES = {
  mercury: {
    id: 'mercury', name: 'Mercury', kind: 'rocky', radius: 200, map: '8k_mercury.jpg', bumpScale: 1.6,
    landing: { lat: 18, lon: 150, yaw: 0.2 }, spin: 0.01,
    atmo: { color: [0.75, 0.72, 0.7], height: 1.0, strength: 0.35, haze: 0.0, hazeDist: 400, rim: 0.25 },
    detail: ROCKY_DETAIL, rocks: 380, dust: true, dustTint: [1, 1, 1],
    light: { color: 0xfff6ec, intensity: 3.4 },
  },
  venus: {
    id: 'venus', name: 'Venus', kind: 'rocky', radius: 240, map: '8k_venus_surface.jpg', bumpScale: 1.0,
    landing: { lat: 5, lon: 100, yaw: 0.6 }, spin: 0.008,
    atmo: { color: [1.0, 0.72, 0.36], height: 3.2, strength: 1.25, haze: 0.5, hazeDist: 90, rim: 0.8 },
    detail: ROCKY_DETAIL, rocks: 260, dust: true, dustTint: [1.05, 0.95, 0.8],
    light: { color: 0xffd9a0, intensity: 2.2 },
  },
  earth: {
    id: 'earth', name: 'Earth', kind: 'rocky', radius: 260, map: '8k_earth_daymap.jpg', bumpScale: 0.6,
    clouds: '8k_earth_clouds.jpg',
    landing: { lat: 23, lon: 12, yaw: 1.2 }, spin: 0.012, // Sahara
    atmo: { color: [0.42, 0.66, 1.0], height: 2.2, strength: 1.3, haze: 0.32, hazeDist: 110, rim: 0.9 },
    detail: ROCKY_DETAIL, rocks: 200, dust: true, dustTint: [1.05, 1.0, 0.9],
    light: { color: 0xfff4e6, intensity: 2.8 },
  },
  moon: {
    id: 'moon', name: 'the Moon', kind: 'rocky', radius: 180, map: '8k_moon.jpg', bumpScale: 1.8,
    landing: { lat: -38, lon: -14, yaw: 0.4 }, spin: 0.01, // near Tycho
    atmo: { color: [0.7, 0.72, 0.78], height: 0.8, strength: 0.3, haze: 0.0, hazeDist: 400, rim: 0.2 },
    detail: ROCKY_DETAIL, rocks: 420, dust: true, dustTint: [1, 1, 1.02], dustDrag: 1.2, dustGrav: 0.25,
    light: { color: 0xffffff, intensity: 3.2 },
  },
  mars: {
    id: 'mars', name: 'Mars', kind: 'rocky', radius: 240, map: '8k_mars.jpg', bumpScale: 1.1,
    landing: { lat: -12, lon: -52, yaw: 0.35 }, spin: 0.012, // eastern Valles Marineris
    atmo: { color: [1.0, 0.62, 0.42], height: 1.6, strength: 0.95, haze: 0.3, hazeDist: 140, rim: 0.6 },
    detail: ROCKY_DETAIL, rocks: 320, dust: true, dustTint: [1.0, 0.9, 0.82],
    light: { color: 0xfff1e0, intensity: 2.6 },
  },
  jupiter: {
    id: 'jupiter', name: 'Jupiter', kind: 'gas', radius: 420, map: '8k_jupiter.jpg',
    landing: { lat: -18, lon: 30, yaw: 0.0 }, spin: 0.004, bands: 0.0009,
    atmo: { color: [1.0, 0.86, 0.66], height: 2.5, strength: 0.7, haze: 0.18, hazeDist: 220, rim: 0.6 },
    detail: { albedo: 0.75, bump: 0 },
    surface: { type: 'cloud', sink: 0.07 }, splash: true, landingSound: 'cloud',
    light: { color: 0xfff0dc, intensity: 2.5 },
  },
  saturn: {
    id: 'saturn', name: 'Saturn', kind: 'saturn', radius: 110, map: '8k_saturn.jpg', ring: '8k_saturn_ring_alpha.png',
    landing: { lat: 0, lon: 0, yaw: 0 }, spin: 0.01, bands: 0.0006,
    atmo: { color: [1.0, 0.88, 0.62], height: 3, strength: 0.9, haze: 0.0, hazeDist: 400, rim: 0.5 },
    detail: { albedo: 0.2, bump: 0 },
    dust: false, ice: true,
    light: { color: 0xfff3e2, intensity: 2.6 },
    camera: { elevEnd: 0.27, aimEnd: 0.85 },
  },
  uranus: {
    id: 'uranus', name: 'Uranus', kind: 'gas', radius: 360, map: '2k_uranus.jpg',
    landing: { lat: 10, lon: 0, yaw: 0 }, spin: 0.004, bands: 0.0004,
    atmo: { color: [0.62, 0.9, 1.0], height: 2.5, strength: 0.75, haze: 0.22, hazeDist: 200, rim: 0.8 },
    detail: { albedo: 0.8, bump: 0 },
    surface: { type: 'cloud', sink: 0.06 }, splash: true, landingSound: 'cloud',
    light: { color: 0xf2f6ff, intensity: 2.4 },
  },
  neptune: {
    id: 'neptune', name: 'Neptune', kind: 'gas', radius: 350, map: '2k_neptune.jpg',
    landing: { lat: -20, lon: 60, yaw: 0 }, spin: 0.005, bands: 0.0007,
    atmo: { color: [0.36, 0.56, 1.0], height: 2.5, strength: 0.8, haze: 0.22, hazeDist: 200, rim: 0.8 },
    detail: { albedo: 0.5, bump: 0 },
    surface: { type: 'cloud', sink: 0.06 }, splash: true, landingSound: 'cloud',
    light: { color: 0xeef2ff, intensity: 2.4 },
  },
  sun: {
    id: 'sun', name: 'the Sun', kind: 'sun', radius: 320, map: '8k_sun.jpg',
    landing: { lat: 8, lon: 40, yaw: 0 }, spin: 0.003,
    atmo: { color: [1.0, 0.45, 0.12], height: 5, strength: 0.7, haze: 0, hazeDist: 400, rim: 0 },
    exposure: 0.62,
    dust: true, plasma: true, dustDrag: 1.6, dustGrav: 0.4, landingSound: 'sizzle',
    light: { color: 0xffc58a, intensity: 1.6 },
  },
};

export const BODY_IDS = Object.keys(BODIES);

// ---------------------------------------------------------------------------

function landingQuat(lat, lon, yaw) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  const d = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  const q = new THREE.Quaternion().setFromUnitVectors(d, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

function landingUV(lat, lon) {
  return [(lon + 180) / 360, (90 - lat) / 180];
}

/** Average colour of the texture around a UV (sRGB 0..1). */
function sampleColor(image, u, v, span = 0.004) {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  const w = image.width;
  const h = image.height;
  g.drawImage(image, (u - span) * w, (v - span) * h, span * 2 * w, span * 2 * h, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = (d.length / 4) * 255;
  return new THREE.Color().setRGB(r / n, gg / n, b / n, THREE.SRGBColorSpace);
}

// Deterministic cosmetic PRNG (rock scatter etc.). Outcomes use crypto, see rng.js.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function surfaceMaterial(def, map, shared) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: def.bumpScale ? map : null,
    envMapIntensity: 0,
    bumpScale: def.bumpScale || 0,
    roughness: 0.96,
    metalness: 0,
  });
  const a = def.atmo;
  const uniforms = {
    uCenter: shared.center,
    uSunDir: shared.sunDir,
    uAtmoColor: { value: new THREE.Color(...a.color) },
    uHaze: { value: a.haze },
    uHazeDist: { value: a.hazeDist },
    uRim: { value: a.rim },
    uDetailAlbedo: { value: def.detail?.albedo ?? 0 },
    uDetailBump: { value: def.detail?.bump ?? 0 },
    uTime: shared.time,
    uBands: { value: def.bands ?? 0 },
  };
  const gas = def.kind === 'gas' || def.kind === 'saturn';
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPObj; varying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvPObj = position; vWPos = (modelMatrix * vec4(position, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPObj; varying vec3 vWPos;
uniform vec3 uCenter; uniform vec3 uSunDir; uniform vec3 uAtmoColor;
uniform float uHaze; uniform float uHazeDist; uniform float uRim;
uniform float uDetailAlbedo; uniform float uDetailBump; uniform float uTime; uniform float uBands;
${NOISE_GLSL}
float camDist() { return length(vWPos - cameraPosition); }
// Close-range terrain detail the 8k map cannot provide at coin scale.
float detailHeight() {
  float d = camDist();
  vec3 p = vPObj;
  float h = 0.0;
  h += 0.16 * fbm3(p * 0.45) * (1.0 - smoothstep(60.0, 160.0, d));
  h += 0.05 * fbm3(p * 1.9 + 7.0) * (1.0 - smoothstep(30.0, 80.0, d));
  h += 0.016 * noise3(p * 7.5 + 3.0) * (1.0 - smoothstep(12.0, 40.0, d));
  h += 0.006 * noise3(p * 24.0) * (1.0 - smoothstep(6.0, 18.0, d));
  return h;
}
vec2 detailDHdxy() {
  float h = detailHeight() * uDetailBump * 9.0;
  return vec2(dFdx(h), dFdy(h));
}`
      )
      .replace(
        '#include <map_fragment>',
        gas
          ? `{
  // Differential band rotation: neighbouring belts drift at different rates.
  vec2 muv = vMapUv;
  float lat = muv.y;
  muv.x += uTime * uBands * (sin(lat * 47.0) * 0.6 + sin(lat * 23.0 + 1.3) * 0.4 + 0.3);
  diffuseColor *= texture2D(map, muv);
  // Close range: stretched cloud streaks and puffy cloud tops.
  float d = camDist();
  float f1 = 1.0 - smoothstep(30.0, 160.0, d);
  float f2 = 1.0 - smoothstep(6.0, 40.0, d);
  vec3 q = vPObj;
  float streak = fbm3(vec3(q.x * 0.06, q.y * 1.4, q.z * 0.06) + vec3(uTime * 0.02, 0.0, 0.0));
  float puff = fbm3(q * 0.9 + vec3(uTime * 0.05, 0.0, uTime * 0.03));
  diffuseColor.rgb *= 1.0 + uDetailAlbedo * ((streak - 0.5) * 1.1 * f1 + (puff - 0.5) * 0.6 * f2);
}`
          : `#include <map_fragment>
{
  float d = camDist();
  float f1 = 1.0 - smoothstep(25.0, 110.0, d);
  float f2 = 1.0 - smoothstep(8.0, 35.0, d);
  float n1 = fbm3(vPObj * 0.8 + 11.0);
  float n2 = noise3(vPObj * 9.0 + 5.0);
  float speck = smoothstep(0.62, 0.8, noise3(vPObj * 22.0));
  diffuseColor.rgb *= 1.0 + uDetailAlbedo * ((n1 - 0.5) * 0.9 * f1 + (n2 - 0.5) * 0.5 * f2 - speck * 0.35 * f2);
}`
      )
      .replace('dHdxy_fwd()', gas ? 'dHdxy_fwd()' : '(dHdxy_fwd() + detailDHdxy())')
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 V = vWPos - cameraPosition;
  float dist = length(V);
  vec3 N0 = normalize(vWPos - uCenter);
  float sunF = smoothstep(-0.25, 0.55, dot(N0, uSunDir));
  float haze = (1.0 - exp(-dist / uHazeDist)) * uHaze;
  float camAlt = length(cameraPosition - uCenter) - length(vWPos - uCenter);
  float rim = pow(1.0 - clamp(dot(N0, -V / dist), 0.0, 1.0), 4.0) * uRim * smoothstep(8.0, 60.0, camAlt);
  outgoingLight = mix(outgoingLight, uAtmoColor * (0.15 + 0.9 * sunF), clamp(haze + rim, 0.0, 0.85) * (0.3 + 0.7 * sunF));
}
#include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => 'surface-' + def.id;
  return mat;
}

export function atmosphereMesh(def, radius, shared) {
  const a = def.atmo;
  const H = a.height;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: shared.center,
      uSunDir: shared.sunDir,
      uR: { value: radius },
      uH: { value: H },
      uColor: { value: new THREE.Color(...a.color) },
      uStrength: { value: a.strength },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCenter; uniform vec3 uSunDir; uniform float uR; uniform float uH;
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vW;
      void main() {
        vec3 o = cameraPosition;
        vec3 d = normalize(vW - o);
        float tc = max(0.0, dot(uCenter - o, d));
        vec3 cp = o + d * tc;
        float r = length(cp - uCenter);
        float alt = max(r - uR, 0.0);
        // Optical depth through a shell with exponential falloff (grazing rays glow most).
        float mu0 = sqrt(uH / (2.0 * uR));
        float mu = max(dot(d, normalize(cp - uCenter)), 0.0);
        float od = exp(-alt / uH) * mu0 / max(mu, mu0) * sqrt(2.0 * uR * uH) / (uH * 18.0);
        float sun = smoothstep(-0.35, 0.45, dot(normalize(cp - uCenter), uSunDir));
        vec3 c = uColor * od * sun * uStrength;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius + H * 7, 160, 80), mat);
  m.renderOrder = 2;
  return m;
}

function rockGeometry(seed) {
  let g = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const rnd = mulberry32(seed);
  const off = [rnd() * 10, rnd() * 10, rnd() * 10];
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n =
      Math.sin(v.x * 3.1 + off[0]) * Math.sin(v.y * 2.7 + off[1]) * Math.sin(v.z * 3.3 + off[2]) * 0.22 +
      Math.sin(v.x * 7.3 + off[1]) * Math.sin(v.y * 6.1 + off[2]) * Math.sin(v.z * 8.2 + off[0]) * 0.09 +
      Math.abs(Math.sin(v.x * 13.1 + v.z * 5.0 + off[2])) * 0.05 - Math.max(0, v.y - 0.55) * 0.35;
    v.multiplyScalar(1 + n);
    v.y *= 0.78; // rocks are flatter than they are tall
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function scatterRocks(def, R, color, count) {
  const rnd = mulberry32(1234 + def.id.length * 77);
  const geo = rockGeometry(7);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.93, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3();
  const c = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 6; tries++) {
    // Denser near the landing site, sparse out to the horizon.
    const r = 2.4 + Math.pow(rnd(), 1.5) * 45;
    const a = rnd() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Keep the camera's line of sight to the coin clear.
    if (z > 0 && Math.abs(x) < 2.2 + z * 0.35 && z < 14) continue;
    const size = 0.03 + Math.pow(rnd(), 4.0) * 0.45 * (0.5 + r / 45);
    up.set(x, R, z).normalize();
    pos.copy(up).multiplyScalar(R).add(new THREE.Vector3(0, -R, 0)).addScaledVector(up, -size * 0.22);
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.6, rnd() * 6.28, (rnd() - 0.5) * 0.6)));
    s.set(size * (0.8 + rnd() * 0.5), size, size * (0.8 + rnd() * 0.5));
    m.compose(pos, q, s);
    mesh.setMatrixAt(n, m);
    c.copy(color).multiplyScalar(0.75 + rnd() * 0.4);
    mesh.setColorAt(n, c);
    n++;
  }
  mesh.count = n;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

// --- The Sun: an emitter, not a lit surface -----------------------------------
function sunMaterial(map, shared) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uTime: shared.time, uCenter: shared.center },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vPObj; varying vec3 vW;
      void main() {
        vUv = uv; vPObj = position;
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map; uniform float uTime; uniform vec3 uCenter;
      varying vec2 vUv; varying vec3 vPObj; varying vec3 vW;
      ${NOISE_GLSL}
      void main() {
        vec2 uv = vUv + vec2(uTime * 0.0015, 0.0);
        vec3 base = texture2D(map, uv).rgb;
        float d = length(vW - cameraPosition);
        // Boiling granulation, finer up close.
        float g1 = fbm3(vPObj * 0.18 + vec3(0.0, uTime * 0.12, uTime * 0.07));
        float g2 = fbm3(vPObj * 1.1 + vec3(uTime * 0.35, 0.0, -uTime * 0.25));
        float g3 = noise3(vPObj * 4.5 + uTime * 0.8) * (1.0 - smoothstep(8.0, 40.0, d));
        float gran = 0.55 + 0.6 * g1 + 0.35 * (g2 - 0.5) + 0.25 * (g3 - 0.5);
        vec3 N = normalize(vW - uCenter);
        float mu = clamp(dot(N, normalize(cameraPosition - vW)), 0.0, 1.0);
        float limb = 0.45 + 0.55 * pow(mu, 0.45);
        vec3 hot = pow(base, vec3(2.0)) * vec3(1.5, 0.5, 0.12) * gran * limb;
        // HDR: bright enough for bloom without clipping everything to white.
        gl_FragColor = vec4(hot * 1.05 + vec3(0.14, 0.02, 0.0) * g2, 1.0);
      }`,
  });
}

// --- Earth's cloud layer (cleared over the landing site) ------------------------
function cloudShell(def, R, tex, sphereQuat, shared) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    alphaMap: tex,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    envMapIntensity: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWc;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWc = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWc;')
      .replace(
        '#include <alphamap_fragment>',
        '#include <alphamap_fragment>\n diffuseColor.a *= 0.92 * smoothstep(14.0, 45.0, length(vWc.xz));'
      );
  };
  const m = new THREE.Mesh(new THREE.SphereGeometry(R + 1.1, 256, 128), mat);
  m.position.set(0, -R, 0);
  m.quaternion.copy(sphereQuat);
  m.renderOrder = 1;
  return m;
}

// --- Saturn: icy ring chunk with the planet and rings below ------------------------
function noiseTexture(size = 512, seed = 3) {
  const rnd = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#d0d4d8';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const r = 1 + Math.pow(rnd(), 3) * 26;
    const v = Math.floor(150 + rnd() * 105);
    g.fillStyle = `rgba(${v},${v},${v},${0.15 + rnd() * 0.3})`;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function iceMaterial(noise) {
  noise.repeat.set(3, 3);
  noise.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.62, 0.74, 0.92),
    map: noise,
    roughness: 0.42,
    roughnessMap: noise,
    bumpMap: noise,
    bumpScale: 6,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    sheen: 0.4,
    sheenColor: new THREE.Color(0.7, 0.85, 1.0),
    envMapIntensity: 0,
  });
}

function chunkGeometry(seed, flatTop) {
  const g = rockGeometry(seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i);
    if (flatTop && y > 0.32) y = 0.32 + (y - 0.32) * 0.04;
    p.setY(i, y);
  }
  // Box-projected UVs so the ice texture and bump wrap the chunk.
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    uv[i * 2] = x * 0.5 + 0.5 + y * 0.35;
    uv[i * 2 + 1] = z * 0.5 + 0.5 + y * 0.35;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function ringMaterial(tex, inner, outer, shared, saturnCenterLocal, Rs) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tRing: { value: tex },
      uInner: { value: inner },
      uOuter: { value: outer },
      uSunDir: shared.sunDir,
      uSat: { value: saturnCenterLocal },
      uRs: { value: Rs },
      uHole: { value: 14 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vL; varying vec3 vW;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tRing; uniform float uInner; uniform float uOuter; uniform vec3 uSunDir;
      uniform vec3 uSat; uniform float uRs; uniform float uHole;
      varying vec3 vL; varying vec3 vW;
      void main() {
        float r = length(vL.xy - uSat.xy);
        float u = (r - uInner) / (uOuter - uInner);
        if (u < 0.0 || u > 1.0) discard;
        vec4 t = texture2D(tRing, vec2(u, 0.5));
        // Clear a gap around the landing chunk (it is drawn as real geometry).
        float hole = smoothstep(uHole * 0.6, uHole, length(vL.xy));
        float a = t.a * hole;
        if (a < 0.01) discard;
        gl_FragColor = vec4(t.rgb * 1.7, a * 0.95);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

async function buildSaturn(def, renderer, shared, load) {
  const [map, ringTex] = await Promise.all([load(def.map), load(def.ring)]);
  ringTex.wrapS = THREE.ClampToEdgeWrapping;
  renderer.initTexture(map);
  renderer.initTexture(ringTex);
  const Rs = def.radius;
  const root = new THREE.Group();
  root.name = def.id;
  const spin = new THREE.Group();
  root.add(spin);

  // Ring plane tilted so Saturn sits low in frame, below the title.
  const tilt = new THREE.Group();
  tilt.position.set(0, -1.15, 0);
  tilt.rotation.x = -0.34;
  root.add(tilt);
  const satLocal = new THREE.Vector3(70, 0, -2.75 * Rs); // in ring-plane coordinates
  const sat = new THREE.Mesh(new THREE.SphereGeometry(Rs, 256, 128), surfaceMaterial(def, map, shared));
  sat.position.copy(satLocal);
  sat.rotation.z = 0.05;
  tilt.add(sat);
  const atmo = atmosphereMesh(def, Rs, shared);
  atmo.position.copy(satLocal);
  tilt.add(atmo);

  const inner = Rs * 1.24;
  const outer = Rs * 2.95;
  const ringGeo = new THREE.PlaneGeometry(outer * 2.2, outer * 2.2, 1, 1);
  const ring = new THREE.Mesh(ringGeo, ringMaterial(ringTex, inner, outer, shared, new THREE.Vector3(satLocal.x, -satLocal.z, 0), Rs));
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  tilt.add(ring);

  // Ice chunks: the landing chunk plus a field of smaller ones in the ring plane.
  const noise = noiseTexture();
  const ice = iceMaterial(noise);
  const chunk = new THREE.Mesh(chunkGeometry(11, true), ice);
  chunk.scale.set(2.5, 1.9, 2.3);
  chunk.updateMatrix();
  chunk.geometry.computeBoundingBox();
  chunk.position.y = -chunk.geometry.boundingBox.max.y * 1.9; // flat top at y = 0
  chunk.castShadow = true;
  chunk.receiveShadow = true;
  spin.add(chunk);

  const rnd = mulberry32(77);
  const field = new THREE.InstancedMesh(chunkGeometry(5, false), ice, 260);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const sc = new THREE.Vector3();
  const ps = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < 1200 && n < 260; i++) {
    const r = 6 + Math.pow(rnd(), 1.3) * 60;
    const a = rnd() * Math.PI * 2;
    ps.set(Math.cos(a) * r, (rnd() - 0.5) * 1.6, Math.sin(a) * r);
    // keep the view to the coin clear (camera sits toward +z in world)
    if (ps.z > 0 && Math.abs(ps.x) < 6 + ps.z * 0.4) continue;
    const s = 0.15 + Math.pow(rnd(), 3) * 2.2;
    sc.set(s * (0.7 + rnd() * 0.6), s * (0.6 + rnd() * 0.5), s * (0.7 + rnd() * 0.6));
    q.setFromEuler(e.set(rnd() * 6, rnd() * 6, rnd() * 6));
    m4.compose(ps, q, sc);
    field.setMatrixAt(n++, m4);
  }
  field.count = n;
  field.castShadow = true;
  field.receiveShadow = true;
  tilt.add(field);

  const groundColor = new THREE.Color(0.72, 0.8, 0.92);
  const body = {
    def, root, spin, sphere: sat, R: Rs, groundColor,
    dustColor: new THREE.Color(0.85, 0.92, 1.0),
    atmoColor: new THREE.Color(...def.atmo.color),
    envMap: map, envGround: new THREE.Color(0.35, 0.33, 0.3), envBand: 0.3,
    flatGround: true,
    textures: [map, ringTex, noise],
    update(t) {
      sat.rotation.y = t * def.spin;
      field.rotation.y = t * 0.004;
    },
  };
  return finishBody(body);
}

function finishBody(body) {
  body.dispose = () => {
    body.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    for (const tx of body.textures) tx.dispose();
  };
  return body;
}

/** Load textures for a body and build its scene graph. */
export async function buildBody(def, renderer, shared) {
  const loader = new THREE.TextureLoader();
  const load = (f) =>
    new Promise((res, rej) =>
      loader.load(TEX(f), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        t.wrapS = THREE.RepeatWrapping;
        res(t);
      }, undefined, rej)
    );
  if (def.kind === 'saturn') return buildSaturn(def, renderer, shared, load);

  const map = await load(def.map);
  renderer.initTexture(map);
  const textures = [map];

  const R = def.radius;
  const root = new THREE.Group(); // rises into view
  root.name = def.id;
  const spin = new THREE.Group(); // slow rotation about the landing-site vertical
  root.add(spin);

  const isSun = def.kind === 'sun';
  const mat = isSun ? sunMaterial(map, shared) : surfaceMaterial(def, map, shared);
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 512, 256), mat);
  sphere.position.set(0, -R, 0);
  const lq = landingQuat(def.landing.lat, def.landing.lon, def.landing.yaw);
  sphere.quaternion.copy(lq);
  sphere.receiveShadow = !isSun;
  spin.add(sphere);

  const [lu, lv] = landingUV(def.landing.lat, def.landing.lon);
  const groundColor = sampleColor(map.image, lu, lv);

  if (def.rocks) spin.add(scatterRocks(def, R, groundColor.clone(), def.rocks));

  let clouds = null;
  if (def.clouds) {
    const ct = await load(def.clouds);
    ct.colorSpace = THREE.NoColorSpace;
    renderer.initTexture(ct);
    textures.push(ct);
    clouds = cloudShell(def, R, ct, lq, shared);
    root.add(clouds);
  }

  const atmo = atmosphereMesh(def, R, shared);
  atmo.position.set(0, -R, 0);
  root.add(atmo);

  const body = {
    def,
    root,
    spin,
    sphere,
    R,
    groundColor,
    dustColor: isSun
      ? new THREE.Color(2.2, 0.75, 0.15)
      : groundColor.clone().multiply(new THREE.Color(...(def.dustTint || [1, 1, 1]))),
    atmoColor: new THREE.Color(...def.atmo.color),
    envMap: map,
    envGround: isSun ? new THREE.Color(1.3, 0.8, 0.45) : new THREE.Color(0.28, 0.28, 0.28),
    envBand: isSun ? 1.5 : 0.5,
    textures,
    update(t) {
      spin.rotation.y = t * def.spin;
      if (clouds) {
        // Clouds drift a little faster than the ground beneath them.
        clouds.quaternion.copy(lq);
        clouds.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), t * def.spin * 2.2);
      }
    },
  };

  if (def.surface?.type === 'cloud') {
    // The coin sinks into the cloud deck: fade its lower part into the cloud colour.
    const sinkColor = groundColor.clone();
    body.flipUpdate = (t, plan) => {
      coinUniforms.uSinkY.value = root.position.y + 0.01;
      coinUniforms.uSinkColor.value.copy(sinkColor).multiplyScalar(0.85);
      coinUniforms.uSinkSoft.value = 0.1;
    };
  }
  if (isSun) {
    body.flipUpdate = (t, plan, coin) => {
      const k = THREE.MathUtils.smoothstep(t, plan.tImp - 0.05, plan.tImp + 2.4);
      coin.setHeat(k * 0.95);
    };
  }
  return finishBody(body);
}
