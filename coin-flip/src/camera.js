// Camera choreography: a static frame for the launch, a slow orbit during the
// slow motion, then a follow-down onto the landing with a gentle push in.
import * as THREE from 'three';
import { smooth } from './timeline.js';

/** Monotone cubic (Fritsch-Carlson) through [t, v] keys: smooth, no overshoot, no stops. */
function curve(keys) {
  const n = keys.length;
  const t = keys.map((k) => k[0]);
  const v = keys.map((k) => k[1]);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * d[i]; m[i + 1] = k * b * d[i]; }
  }
  // Ease in/out of the first and last key.
  m[0] = 0;
  m[n - 1] = 0;
  return (x) => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0;
    while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i];
    const s = (x - t[i]) / h;
    const s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

export function makeCameraRig(plan, def) {
  const cam = { ...(def.camera || {}) };
  const tI = plan.tImp;
  const restY = cam.restY ?? 0.15;
  const startY = plan.yApex + 0.55;

  // Vertical focus follows the coin through a critically damped spring,
  // precomputed so the rig is still a pure function of time.
  const DT = 0.002;
  const N = Math.ceil((plan.duration + 1) / DT);
  const fy = new Float32Array(N + 1);
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  {
    let y = startY, v = 0;
    const w = 15;
    for (let i = 0; i <= N; i++) {
      const t = i * DT;
      plan.coinPose(t, p, q);
      const follow = smooth(0.42, 1.2, t);
      const want = THREE.MathUtils.lerp(startY, Math.max(p.y, restY), follow);
      const a = w * w * (want - y) - 2 * w * v;
      v += a * DT;
      y += v * DT;
      fy[i] = y;
    }
  }
  const dist = curve(cam.dist || [[0, 9.6], [0.55, 9.2], [1.25, 7.8], [tI, 6.9], [tI + 3.5, 6.1]]);
  const yaw = curve(cam.yaw || [[0, -0.06], [1.25, 0.16], [tI, 0.26], [tI + 3.5, 0.34]]);
  const elev = curve(cam.elev || [[0, 0.03], [0.6, 0.1], [1.3, 0.22], [tI, cam.elevEnd ?? 0.36], [tI + 3.5, (cam.elevEnd ?? 0.36) + 0.02]]);
  const aim = curve(cam.aim || [[0, 0.75], [1.0, 0.25], [tI, 0.55], [tI + 0.8, (cam.aimEnd ?? 1.1) - 0.15], [tI + 3.5, cam.aimEnd ?? 1.1]]);

  return (t, outPos, outTarget) => {
    const i = Math.min(N - 1, Math.max(0, t / DT));
    const i0 = Math.floor(i);
    const F = fy[i0] + (fy[i0 + 1] - fy[i0]) * (i - i0);
    const d = dist(t), a = yaw(t), e = elev(t);
    outPos.set(Math.sin(a) * Math.cos(e) * d, F + Math.sin(e) * d, Math.cos(a) * Math.cos(e) * d);
    outTarget.set(0, F + aim(t), 0);
    // Impact jolt.
    if (t > tI) {
      const s = t - tI;
      const k = Math.exp(-s * 16) * 0.05 * (def.kind === 'cloud' ? 0.4 : 1);
      outPos.y += Math.sin(s * 75) * k;
      outTarget.y += Math.sin(s * 75 + 1) * k * 0.6;
    }
  };
}
