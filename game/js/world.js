// World for Sembel Sky Courier: island archipelago, sea, sky, sun, clouds,
// runway, glowing delivery rings and palm trees. Everything procedural,
// seeded so a screenshot seed reproduces the same world.

import * as THREE from 'three';

// --- deterministic helpers -------------------------------------------------

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smoothNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

function fbm(x, z) {
  let v = 0;
  let amp = 1;
  let f = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * smoothNoise(x * f, z * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return v;
}

function islandBump(x, z, cx, cz, r, h) {
  const dx = (x - cx) / r;
  const dz = (z - cz) / r;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1) return 0;
  const rough = 0.7 + 0.6 * fbm(x * 0.004 + 7, z * 0.004 + 3);
  return h * Math.pow(1 - d2, 1.5) * rough;
}

// --- terrain height (shared by the flight model) ---------------------------

export const RUNWAY = { x: 0, z: 120, length: 560, width: 26, height: 4 };

function flattenNearRunway(x, z, h) {
  const hx = RUNWAY.length / 2 + 130;
  const hz = RUNWAY.width / 2 + 130;
  const dx = Math.max(0, Math.abs(x - RUNWAY.x) - RUNWAY.length / 2);
  const dz = Math.max(0, Math.abs(z - RUNWAY.z) - RUNWAY.width / 2);
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= 130) return h;
  const t = d / 130;
  const blend = t * t * (3 - 2 * t); // smoothstep: 0 on the strip, 1 outside
  return RUNWAY.height + (h - RUNWAY.height) * blend;
}

export function terrainHeight(x, z) {
  let h = -6;
  h += islandBump(x, z, 0, 0, 620, 55);
  h += islandBump(x, z, 900, -500, 380, 38);
  h += islandBump(x, z, -850, 450, 330, 30);
  h += islandBump(x, z, 300, 950, 300, 26);
  h += islandBump(x, z, -700, -800, 260, 22);
  return flattenNearRunway(x, z, h);
}

// --- ring course -----------------------------------------------------------

export const RING_DEFS = [
  { x: 420, y: 60, z: 100 },
  { x: 760, y: 75, z: -320 },
  { x: 950, y: 65, z: -650 },
  { x: 500, y: 70, z: -900 },
  { x: 100, y: 55, z: -500 },
];
export const RING_RADIUS = 13;

// --- world construction ----------------------------------------------------

export function createWorld(scene, seed) {
  const rng = makeRng(seed);
  const world = { rings: [], ringMeshes: [], clouds: [], beam: null };

  // Sky dome: vertex-coloured gradient, pale at the horizon, blue above.
  const skyGeo = new THREE.SphereGeometry(3200, 24, 14);
  const skyPos = skyGeo.attributes.position;
  const skyColors = new Float32Array(skyPos.count * 3);
  const top = new THREE.Color(0x2f7fd0);
  const horizon = new THREE.Color(0xd8ecf7);
  const tmp = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i) / 3200;
    const t = Math.max(0, Math.min(1, y * 1.6 + 0.12));
    tmp.copy(horizon).lerp(top, t);
    skyColors[i * 3] = tmp.r;
    skyColors[i * 3 + 1] = tmp.g;
    skyColors[i * 3 + 2] = tmp.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(
    skyGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // Lights and fog.
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3d6b3a, 0.95);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff2d0, 1.9);
  sunLight.position.set(700, 900, 400);
  scene.add(sunLight);
  scene.fog = new THREE.Fog(0xa8cfe8, 500, 2800);

  // Sun disc with a soft glow sprite.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, fog: false })
  );
  sunDisc.position.set(1500, 1150, 900);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);
  world.sunGlow = makeGlowSprite(0xfff2b0, 520);
  world.sunGlow.position.copy(sunDisc.position);
  scene.add(world.sunGlow);

  // Sea.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(7000, 7000),
    new THREE.MeshPhongMaterial({ color: 0x1f7fb5, shininess: 90, specular: 0x99ccdd })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.2;
  scene.add(sea);

  // Terrain: displaced plane with vertex colours by height.
  const terrainGeo = new THREE.PlaneGeometry(2600, 2600, 170, 170);
  terrainGeo.rotateX(-Math.PI / 2);
  const tPos = terrainGeo.attributes.position;
  const tColors = new Float32Array(tPos.count * 3);
  const sand = new THREE.Color(0xe8d49a);
  const grass = new THREE.Color(0x4d9a3d);
  const deepGrass = new THREE.Color(0x2e6b2a);
  const rock = new THREE.Color(0x8a7f72);
  const cTmp = new THREE.Color();
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    const h = terrainHeight(x, z);
    tPos.setY(i, h);
    if (h < 1.2) cTmp.copy(sand);
    else if (h < 16) cTmp.copy(sand).lerp(grass, (h - 1.2) / 14.8);
    else if (h < 34) cTmp.copy(grass).lerp(deepGrass, (h - 16) / 18);
    else cTmp.copy(deepGrass).lerp(rock, Math.min(1, (h - 34) / 16));
    // Speckle so the ground reads at a glance instead of flat colour.
    const sp = 0.92 + 0.16 * hash2(Math.floor(x * 0.5), Math.floor(z * 0.5));
    tColors[i * 3] = cTmp.r * sp;
    tColors[i * 3 + 1] = cTmp.g * sp;
    tColors[i * 3 + 2] = cTmp.b * sp;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(tColors, 3));
  terrainGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshLambertMaterial({ vertexColors: true })
  );
  scene.add(terrain);

  buildRunway(scene);
  buildTrees(scene, rng);
  buildClouds(scene, rng, world);
  buildRings(scene, world);

  world.update = function (dt, t) {
    // Clouds drift with the wind and wrap around the play area.
    for (const cloud of world.clouds) {
      cloud.position.x += 2.2 * dt;
      cloud.position.z += 0.7 * dt;
      if (cloud.position.x > 1400) cloud.position.x = -1400;
      if (cloud.position.z > 1400) cloud.position.z = -1400;
    }
    // The active ring pulses; passed rings stay green and dim.
    for (let i = 0; i < world.ringMeshes.length; i++) {
      const mesh = world.ringMeshes[i];
      const state = world.rings[i].state;
      if (state === 'next') {
        const s = 1 + 0.07 * Math.sin(t * 4);
        mesh.scale.set(s, s, s);
        mesh.material.color.setHex(0xffc233);
      } else if (state === 'done') {
        mesh.material.color.setHex(0x2ecc71);
      } else {
        mesh.material.color.setHex(0xff9a3d);
      }
    }
    if (world.beam) world.beam.material.opacity = 0.09 + 0.04 * Math.sin(t * 2.2);
  };

  world.setActiveRing = function (index) {
    for (let i = 0; i < world.rings.length; i++) {
      world.rings[i].state = i < index ? 'done' : i === index ? 'next' : 'todo';
    }
    if (index >= 0 && index < world.rings.length) {
      const r = world.rings[index];
      world.beam.position.set(r.x, r.y + 150, r.z);
      world.beam.visible = true;
    } else {
      world.beam.visible = false;
    }
  };

  return world;
}

// --- pieces ----------------------------------------------------------------

function makeGlowSprite(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  return sprite;
}

function buildRunway(scene) {
  const group = new THREE.Group();
  const y = RUNWAY.height + 0.15;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(RUNWAY.length, 0.3, RUNWAY.width),
    new THREE.MeshLambertMaterial({ color: 0x2b2f36 })
  );
  strip.position.set(RUNWAY.x, y, RUNWAY.z);
  group.add(strip);

  // Centreline dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5 });
  for (let i = 0; i < 13; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(18, 0.1, 1.6), dashMat);
    dash.position.set(RUNWAY.x - RUNWAY.length / 2 + 30 + i * 41, y + 0.2, RUNWAY.z);
    group.add(dash);
  }
  // Threshold bars at both ends.
  for (const sx of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 2.2), dashMat);
      bar.position.set(
        RUNWAY.x + sx * (RUNWAY.length / 2 - 14),
        y + 0.2,
        RUNWAY.z + k * 4.4
      );
      group.add(bar);
    }
  }
  // Edge lights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
  for (let i = 0; i <= 14; i++) {
    for (const sz of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), lightMat);
      lamp.position.set(
        RUNWAY.x - RUNWAY.length / 2 + (i * RUNWAY.length) / 14,
        y + 0.6,
        RUNWAY.z + sz * (RUNWAY.width / 2 + 1.5)
      );
      group.add(lamp);
    }
  }
  // Windsock: pole + orange cone pointing into the wind.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 })
  );
  pole.position.set(RUNWAY.x + 60, y + 4.5, RUNWAY.z - RUNWAY.width / 2 - 8);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 3.6, 10),
    new THREE.MeshLambertMaterial({ color: 0xff7a2e })
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.x + 62, y + 8.6, RUNWAY.z - RUNWAY.width / 2 - 8);
  group.add(sock);

  scene.add(group);
}

function buildTrees(scene, rng) {
  const COUNT = 340;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.45, 3.2, 6);
  const canopyGeo = new THREE.ConeGeometry(2.4, 7, 7);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7d33 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, COUNT);
  const dummy = new THREE.Object3D();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard < 6000) {
    guard++;
    const x = (rng() - 0.5) * 2300;
    const z = (rng() - 0.5) * 2300;
    const h = terrainHeight(x, z);
    if (h < 2.5 || h > 30) continue;
    if (Math.abs(x - RUNWAY.x) < RUNWAY.length / 2 + 40 &&
        Math.abs(z - RUNWAY.z) < RUNWAY.width / 2 + 40) continue;
    const s = 0.8 + rng() * 0.7;
    dummy.position.set(x, h + 1.6 * s, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.y = rng() * Math.PI * 2;
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.y = h + (3.2 + 3.2) * s;
    dummy.updateMatrix();
    canopies.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed;
  scene.add(trunks);
  scene.add(canopies);
}

function buildClouds(scene, rng, world) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    fog: false,
  });
  for (let i = 0; i < 16; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let p = 0; p < puffs; p++) {
      const r = 14 + rng() * 22;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
      puff.position.set((rng() - 0.5) * 46, (rng() - 0.5) * 7, (rng() - 0.5) * 22);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(
      (rng() - 0.5) * 2600,
      150 + rng() * 120,
      (rng() - 0.5) * 2600
    );
    scene.add(cloud);
    world.clouds.push(cloud);
  }
}

function buildRings(scene, world) {
  const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 0.9, 12, 42);
  for (let i = 0; i < RING_DEFS.length; i++) {
    const def = RING_DEFS[i];
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a3d });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.position.set(def.x, def.y, def.z);
    // Face the ring toward the previous waypoint so the pilot flies through it.
    const prev = i === 0
      ? { x: -240, y: 8, z: 120 }
      : RING_DEFS[i - 1];
    mesh.lookAt(prev.x, prev.y, prev.z);
    scene.add(mesh);
    const glow = makeGlowSprite(0xffc233, 46);
    glow.position.copy(mesh.position);
    scene.add(glow);
    world.rings.push({ x: def.x, y: def.y, z: def.z, state: 'todo', glow });
    world.ringMeshes.push(mesh);
  }
  // Vertical beacon over the active ring, visible from far away.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 320, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffc233,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  beam.visible = false;
  scene.add(beam);
  world.beam = beam;
}
