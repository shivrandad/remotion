// The coin: lathe-turned edge with a chamfer and reeding, two engraved faces.
import * as THREE from 'three';
import { makeFaceMaps, makeEdgeMaps } from './coinTextures.js';

export const COIN_R = 1;
export const COIN_HALF = 0.085; // half thickness
const CHAMFER = 0.022;

// Linear-space gold F0.
const GOLD = new THREE.Color(1.0, 0.766, 0.336);

/** Shared uniforms injected into every coin material. */
export const coinUniforms = {
  uWeight: { value: 1 }, // motion-blur accumulation weight (premultiplied output)
  uSinkY: { value: -100 }, // world Y of a cloud deck that swallows the coin
  uSinkColor: { value: new THREE.Color(0.8, 0.65, 0.5) },
  uSinkSoft: { value: 0.12 },
};

function patch(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, coinUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCoinWorld;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvCoinWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uWeight; uniform float uSinkY; uniform vec3 uSinkColor; uniform float uSinkSoft;
varying vec3 vCoinWorld;`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
float sink = smoothstep(uSinkY + uSinkSoft, uSinkY - uSinkSoft, vCoinWorld.y);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uSinkColor, sink);
gl_FragColor *= uWeight;`
      );
  };
  material.customProgramCacheKey = () => 'coin-v1';
  return material;
}

function edgeGeometry() {
  const pts = [];
  const h = COIN_HALF;
  const R = COIN_R;
  const c = CHAMFER;
  const arc = (cx, cy, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * c, cy + Math.sin(a) * c));
    }
  };
  // Bottom rounded corner, straight band, top rounded corner.
  arc(R - c, -h + c, -Math.PI / 2, 0, 8);
  arc(R - c, h - c, 0, Math.PI / 2, 8);
  const g = new THREE.LatheGeometry(pts, 384);
  // Re-map v to height so the reeding texture band lines up with the straight wall.
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) + h) / (2 * h));
  uv.needsUpdate = true;
  return g;
}

export function createCoin(renderer) {
  const heads = makeFaceMaps('H', renderer);
  const tails = makeFaceMaps('T', renderer);
  const edge = makeEdgeMaps(renderer, 150, [CHAMFER / (2 * COIN_HALF), 1 - CHAMFER / (2 * COIN_HALF)]);

  const faceMat = (maps) =>
    patch(
      new THREE.MeshPhysicalMaterial({
        color: GOLD,
        metalness: 1,
        roughness: 1, // scaled by roughnessMap (G channel)
        map: maps.map,
        normalMap: maps.normalMap,
        normalScale: new THREE.Vector2(1, 1),
        roughnessMap: maps.ormMap,
        aoMap: maps.ormMap,
        aoMapIntensity: 1,
        clearcoat: 0.15,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.25,
      })
    );

  const headsMat = faceMat(heads);
  const tailsMat = faceMat(tails);
  const edgeMat = patch(
    new THREE.MeshPhysicalMaterial({
      color: GOLD,
      metalness: 1,
      roughness: 1,
      normalMap: edge.normalMap,
      roughnessMap: edge.ormMap,
      aoMap: edge.ormMap,
      envMapIntensity: 1.25,
      clearcoat: 0.15,
      clearcoatRoughness: 0.1,
    })
  );

  const group = new THREE.Group();
  group.name = 'coin';

  const edgeMesh = new THREE.Mesh(edgeGeometry(), edgeMat);
  group.add(edgeMesh);

  const capGeo = new THREE.CircleGeometry(COIN_R - CHAMFER, 192);
  const top = new THREE.Mesh(capGeo, headsMat);
  top.rotation.x = -Math.PI / 2; // normal +Y, letter top towards -Z
  top.position.y = COIN_HALF;
  group.add(top);

  const bottom = new THREE.Mesh(capGeo, tailsMat);
  bottom.rotation.x = Math.PI / 2; // normal -Y
  bottom.position.y = -COIN_HALF;
  group.add(bottom);

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const materials = [headsMat, tailsMat, edgeMat];
  return {
    group,
    materials,
    /** Red-hot glow amount 0..1 (used on the Sun). */
    setHeat(k) {
      // Blackbody-ish ramp: dull red -> orange -> yellow-white.
      const c = new THREE.Color();
      if (k <= 0) c.setRGB(0, 0, 0);
      else {
        const r = Math.min(1, k * 1.6);
        const g = Math.max(0, Math.min(1, (k - 0.35) * 1.4)) * 0.55;
        const b = Math.max(0, (k - 0.8) * 1.5) * 0.25;
        c.setRGB(r, g, b);
      }
      for (const m of materials) {
        m.emissive.copy(c);
        m.emissiveIntensity = 2.2 * k;
        m.roughness = 1;
      }
    },
  };
}
