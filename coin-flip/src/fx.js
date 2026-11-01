// Contact shadow and impact dust. Both are pure functions of plan time.
import * as THREE from 'three';
import { NOISE_GLSL } from './noise.js';

export function createContactShadow() {
  const uniforms = {
    uR: { value: 150 },
    uCoin: { value: new THREE.Vector3() }, // coin centre
    uLow: { value: 10 }, // height of the coin's lowest point above ground
    uOffset: { value: new THREE.Vector2() },
    uStrength: { value: 0.85 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uR;
      varying vec2 vP;
      void main() {
        vec3 p = position;
        // Follow the planet's curvature so the decal hugs the ground.
        p.y = -(p.x * p.x + p.z * p.z) / (2.0 * uR) + 0.004;
        vP = p.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uCoin; uniform float uLow; uniform vec2 uOffset; uniform float uStrength;
      varying vec2 vP;
      void main() {
        float h = max(uLow, 0.0);
        vec2 c = uCoin.xz + uOffset * h;
        float d = length(vP - c);
        // Wide penumbra that grows and fades with height.
        float rs = 1.05 + h * 0.55;
        float soft = exp(-pow(d / rs, 2.0) * 1.6) * exp(-h * 0.9);
        // Tight ambient-occlusion core when touching.
        float core = smoothstep(1.22, 0.7, length(vP - uCoin.xz)) * exp(-h * 9.0);
        float a = clamp(soft * 0.7 + core * 0.55, 0.0, 1.0) * uStrength;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const geo = new THREE.PlaneGeometry(10, 10, 40, 40);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

/**
 * Impact dust: a ring of soft puffs thrown outward along the ground and up.
 * bursts: [{ t, strength }]
 */
export function createDust(maxPerBurst = 260) {
  const bursts = 2;
  const count = maxPerBurst * bursts;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const meta = new Float32Array(count * 4); // burst index, life, size, seed
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < bursts; b++) {
    for (let i = 0; i < maxPerBurst; i++) {
      const k = b * maxPerBurst + i;
      const a = rnd() * Math.PI * 2;
      const r = 0.75 + rnd() * 0.35;
      pos[k * 3] = Math.cos(a) * r;
      pos[k * 3 + 1] = 0.02 + rnd() * 0.08;
      pos[k * 3 + 2] = Math.sin(a) * r;
      const sp = 1.2 + Math.pow(rnd(), 1.5) * 4.5;
      vel[k * 3] = Math.cos(a) * sp;
      vel[k * 3 + 1] = 0.25 + rnd() * rnd() * 2.2;
      vel[k * 3 + 2] = Math.sin(a) * sp;
      meta[k * 4] = b;
      meta[k * 4 + 1] = 1.1 + rnd() * 1.6;
      meta[k * 4 + 2] = 0.12 + rnd() * 0.3;
      meta[k * 4 + 3] = rnd();
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aMeta', new THREE.BufferAttribute(meta, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);

  const uniforms = {
    uTime: { value: -10 },
    uBurstT: { value: new THREE.Vector2(1e3, 1e3) },
    uBurstS: { value: new THREE.Vector2(1, 0.4) },
    uColor: { value: new THREE.Color(0.6, 0.35, 0.2) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uScale: { value: 800 },
    uDrag: { value: 2.4 },
    uGrav: { value: 0.9 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aVel; attribute vec4 aMeta;
      uniform float uTime; uniform vec2 uBurstT; uniform vec2 uBurstS; uniform float uScale;
      uniform float uDrag; uniform float uGrav;
      varying float vAlpha; varying float vSeed; varying float vAge;
      void main() {
        float bt = aMeta.x < 0.5 ? uBurstT.x : uBurstT.y;
        float bs = aMeta.x < 0.5 ? uBurstS.x : uBurstS.y;
        float age = uTime - bt;
        float life = aMeta.y;
        vAge = age / life;
        vSeed = aMeta.w;
        // Only a fraction of the particles fire on weaker bursts.
        float act = step(aMeta.w, bs) * step(0.0, age) * step(age, life);
        float k = (1.0 - exp(-uDrag * age)) / uDrag;
        vec3 p = position * (0.6 + 0.4 * bs) + aVel * k * (0.55 + 0.45 * bs);
        p.y += -0.5 * uGrav * age * age * 0.15;
        p.y = max(p.y, 0.02);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float size = aMeta.z * (1.0 + age * 1.8) * (0.6 + 0.4 * bs);
        gl_PointSize = act * size * uScale / -mv.z;
        vAlpha = act * smoothstep(0.0, 0.06, age) * pow(1.0 - vAge, 1.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uSunDir;
      varying float vAlpha; varying float vSeed; varying float vAge;
      ${NOISE_GLSL}
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c) * 2.0;
        float n = noise3(vec3(c * 4.0, vSeed * 40.0 + vAge * 1.5));
        float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.6) * vAlpha * 0.55;
        if (a < 0.003) discard;
        // Puffs are lit from above-front, darker underneath.
        float lit = 0.55 + 0.45 * clamp(-c.y * 2.0 + 0.4, 0.0, 1.0);
        gl_FragColor = vec4(uColor * lit * 1.4, a);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = 3;
  points.frustumCulled = false;
  return { points, uniforms };
}
