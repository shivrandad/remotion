// The whole flip is a pure function of time since the click. Nothing is
// integrated frame-to-frame, so it plays identically at any frame rate,
// sub-frame samples for motion blur are exact, and any moment can be scrubbed.
import * as THREE from 'three';
import { COIN_R, COIN_HALF } from './coin.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

// --- Time warp (slow motion) -------------------------------------------------
const SLOW = 0.12;
function speed(t) {
  if (t < 0.25) return 1;
  if (t < 0.5) return lerp(1, SLOW, smooth(0.25, 0.5, t));
  if (t < 1.05) return SLOW;
  if (t < 1.6) return lerp(SLOW, 1, smooth(1.05, 1.6, t));
  return 1;
}
const DT = 0.0005;
const TMAX = 8;
const tauTable = new Float32Array(Math.ceil(TMAX / DT) + 2);
for (let i = 1; i < tauTable.length; i++) {
  const t = (i - 0.5) * DT;
  tauTable[i] = tauTable[i - 1] + speed(t) * DT;
}
export function simTime(t) {
  if (t <= 0) return t;
  const f = t / DT;
  const i = Math.min(tauTable.length - 2, Math.floor(f));
  return lerp(tauTable[i], tauTable[i + 1], f - i);
}
export function timeScale(t) {
  return speed(t);
}

// --- Contact geometry -------------------------------------------------------
/** Centre height when a coin tilted by `a` rests on its rim. */
const contactY = (a) => COIN_R * Math.sin(Math.abs(a)) + COIN_HALF * Math.cos(a);

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Build a flip plan.
 * @param result 'heads' | 'tails'
 * @param surface { type: 'solid' | 'cloud', bounce }  how the body receives the coin
 * @param jitter  cosmetic variation [0,1) values
 */
export function makePlan(result, surface, jitter = [0.5, 0.5, 0.5]) {
  const g = 40;
  const tApex = 0.72;
  const tImp = 1.95;
  const isCloud = surface.type === 'cloud';

  const alpha1 = isCloud ? 0.28 : 0.42 + jitter[0] * 0.08; // tilt at first impact
  const alpha0 = isCloud ? 0.14 : 0.19; // tilt when the wobble starts
  const y1 = contactY(alpha1);

  const tauUp = simTime(tApex);
  const tauImp = simTime(tImp);
  const tauDn = tauImp - tauUp;
  const y0 = y1 + (g * (tauDn * tauDn - tauUp * tauUp)) / 2;
  const yApex = y0 + (g * tauUp * tauUp) / 2;

  // Face: heads = H (+Y cap) up. Rotation about X by an even/odd number of half turns.
  const halfTurns = 2 * 9 + (result === 'tails' ? 1 : 0);
  const thetaTarget = halfTurns * Math.PI;
  const omega = (thetaTarget - alpha1) / (tauImp + 0.12); // rad per sim-second (~30)
  const thetaStart = thetaTarget - alpha1 - omega * tauImp;
  const base = new THREE.Quaternion().setFromAxisAngle(X, thetaTarget % (2 * Math.PI));

  const x0 = -0.9 + jitter[1] * 0.4;
  const z0 = -0.6;
  const vx = -x0 / tauImp;
  const vz = -z0 / tauImp;
  const yaw0 = (jitter[2] - 0.5) * 0.5; // final letter rotation on the table

  // Bounce (solid) or plunge (cloud).
  const Tb = isCloud ? 0.5 : surface.bounce ?? 0.24;
  const y2 = contactY(alpha0);
  const vb = (y2 - y1 + (g * Tb * Tb) / 2) / Tb;
  const tW0 = tImp + Tb;
  const Tw = isCloud ? 1.35 : 1.25;
  const tRest = tW0 + Tw;

  // Precompute the Euler-disk precession angle and the rim-contact "ticks".
  const N = 4000;
  const phiTab = new Float32Array(N + 1);
  const ticks = [];
  {
    let phi = Math.PI / 2;
    let next = Math.PI;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = alpha0 * Math.pow(1 - u, 1.15);
      const rate = Math.min(isCloud ? 18 : 70, (isCloud ? 5 : 8.5) * Math.sqrt(alpha0 / Math.max(a, 1e-4)));
      phiTab[i] = phi;
      phi += (rate * Tw) / N;
      while (phi > next) {
        ticks.push({ t: tW0 + u * Tw, amp: a / alpha0 });
        next += Math.PI;
      }
    }
  }
  const sinkDepth = isCloud ? surface.sink ?? 0.1 : 0;

  const qTmp = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const n = new THREE.Vector3();

  /** Coin pose at real time t (seconds since click). */
  function coinPose(t, outPos, outQuat) {
    let y, x, z;
    if (t < tImp) {
      const tau = simTime(t);
      y = yApex - (g * (tau - tauUp) ** 2) / 2;
      x = x0 + vx * tau;
      z = z0 + vz * tau;
      const theta = thetaStart + omega * tau;
      outQuat.setFromAxisAngle(X, theta);
      // A little off-axis precession during flight, gone by the impact.
      const k = 1 - smooth(tImp - 0.6, tImp, t);
      qTmp.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12 * k * Math.sin(tau * 9));
      outQuat.premultiply(qTmp);
      qYaw.setFromAxisAngle(Y, yaw0 * (1 - k * 0.6));
      outQuat.premultiply(qYaw);
    } else if (t < tW0) {
      const s = t - tImp;
      const u = s / Tb;
      if (isCloud) {
        // Decelerating plunge through the cloud deck.
        const e = 1 - Math.pow(1 - u, 2.2);
        y = lerp(y1, y2 - sinkDepth * 0.8, e);
      } else {
        y = y1 + vb * s - (g * s * s) / 2;
      }
      x = 0;
      z = 0;
      const ang = lerp(-alpha1, alpha0, isCloud ? 1 - Math.pow(1 - u, 2) : u);
      outQuat.setFromAxisAngle(X, thetaTarget + ang);
      qYaw.setFromAxisAngle(Y, yaw0);
      outQuat.premultiply(qYaw);
    } else {
      const u = clamp((t - tW0) / Tw, 0, 1);
      const a = alpha0 * Math.pow(1 - u, 1.15);
      const fi = u * N;
      const i = Math.min(N - 1, Math.floor(fi));
      const phi = lerp(phiTab[i], phiTab[i + 1], fi - i);
      const pe = phi - yaw0; // tilt direction expressed in the yawed frame
      n.set(Math.sin(a) * Math.cos(pe), Math.cos(a), Math.sin(a) * Math.sin(pe));
      qTmp.setFromUnitVectors(Y, n);
      outQuat.copy(base);
      // Rolling on the rim slowly turns the coin about its own axis.
      const roll = -(phi - Math.PI / 2) * (1 - Math.cos(alpha0)) * 0.5;
      qYaw.setFromAxisAngle(Y, yaw0 + roll);
      outQuat.premultiply(qYaw).premultiply(qTmp);
      y = contactY(a);
      if (isCloud) {
        // Settles into the deck with a slow buoyant bob.
        const bob = Math.sin((t - tW0) * 5) * 0.025 * (1 - u);
        y -= lerp(sinkDepth * 0.8, sinkDepth, smooth(0, 1, u)) - bob;
      }
      x = 0;
      z = 0;
    }
    outPos.set(x, y, z);
  }

  /** Angular speed proxy (rad/s, real time) for picking motion-blur samples. */
  function spin(t) {
    if (t < tImp) return omega * timeScale(t);
    return 0;
  }
  function linearSpeed(t) {
    if (t < tImp) {
      const tau = simTime(t);
      return Math.abs(g * (tau - tauUp)) * timeScale(t);
    }
    return 0;
  }

  return {
    result,
    g,
    tApex,
    tImp,
    tBounceLand: tW0,
    tRest,
    yApex,
    y0,
    ticks,
    isCloud,
    sinkDepth,
    coinPose,
    timeScaleAt: timeScale,
    spin,
    linearSpeed,
    textStart: tRest + 0.05,
    duration: tRest + 2.6,
  };
}

export { smooth, clamp, lerp };
