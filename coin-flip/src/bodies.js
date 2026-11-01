// Celestial bodies. Each one is built around a landing site at the world
// origin: the planet's centre sits at (0, -R, 0) so the coin lands on (0,0,0).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { NOISE_GLSL } from './noise.js';

const TEX = (f) => `${import.meta.env.BASE_URL}textures/${f}`;

export const BODIES = {
  mars: {
    id: 'mars',
    name: 'Mars',
    kind: 'rocky',
    radius: 240,
    map: '8k_mars.jpg',
    bumpScale: 1.1,
    landing: { lat: -12, lon: -52, yaw: 0.35 }, // eastern Valles Marineris
    spin: 0.012,
    atmo: { color: [1.0, 0.62, 0.42], height: 1.6, strength: 0.95, haze: 0.3, hazeDist: 140, rim: 0.6 },
    detail: { albedo: 0.32, bump: 1.0 },
    rocks: 320,
    dust: true,
    dustTint: [1.0, 0.9, 0.82],
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
  };
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
uniform float uDetailAlbedo; uniform float uDetailBump;
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
        `#include <map_fragment>
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
      .replace('dHdxy_fwd()', '(dHdxy_fwd() + detailDHdxy())')
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
  const map = await load(def.map);
  renderer.initTexture(map);

  const R = def.radius;
  const root = new THREE.Group(); // rises into view
  root.name = def.id;
  const spin = new THREE.Group(); // slow rotation about the landing-site vertical
  root.add(spin);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 512, 256), surfaceMaterial(def, map, shared));
  sphere.position.set(0, -R, 0);
  sphere.quaternion.copy(landingQuat(def.landing.lat, def.landing.lon, def.landing.yaw));
  sphere.receiveShadow = true;
  spin.add(sphere);

  const [lu, lv] = landingUV(def.landing.lat, def.landing.lon);
  const groundColor = sampleColor(map.image, lu, lv);

  if (def.rocks) spin.add(scatterRocks(def, R, groundColor.clone(), def.rocks));

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
    dustColor: groundColor.clone().multiply(new THREE.Color(...(def.dustTint || [1, 1, 1]))),
    atmoColor: new THREE.Color(...def.atmo.color),
    envMap: map,
    envGround: new THREE.Color(0.28, 0.28, 0.28),
    envBand: 0.5,
    textures: [map],
    update(t) {
      spin.rotation.y = t * def.spin;
    },
    dispose() {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      for (const tx of body.textures) tx.dispose();
    },
  };
  return body;
}
