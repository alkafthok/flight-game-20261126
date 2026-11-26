// Sembel Sky Courier — bootstrap, game loop, input, camera and states.
// Title -> playing -> paused / complete / crashed, plus a frozen shot mode
// (?shot=start|play|end) that poses a scene for screenshots.

import * as THREE from 'three';
import { FlightState } from './flight.js';
import { createWorld, RUNWAY, terrainHeight } from './world.js';
import { buildPlane } from './plane.js';
import { HUD } from './hud.js';
import { Missions } from './missions.js';
import { GameAudio } from './audio.js';
import { getShotParams, poseShot } from './shots.js';

// Surface page errors into a hidden div so a headless run can report them.
window.addEventListener('error', (event) => {
  const log = document.getElementById('errlog');
  if (log) log.textContent += event.message + ' | ';
});
window.addEventListener('unhandledrejection', (event) => {
  const log = document.getElementById('errlog');
  if (log) log.textContent += 'promise: ' + event.reason + ' | ';
});

const START_POS = { x: -240, y: RUNWAY.height + 1.15, z: RUNWAY.z };
const START_HEADING = Math.PI / 2; // down the runway, facing +X

const shotParams = getShotParams();
const seed = shotParams ? shotParams.seed : 7;

// --- renderer / scene ------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 7000);
camera.position.set(-260, 14, 110);
camera.lookAt(0, 6, 120);

const world = createWorld(scene, seed);
const plane = buildPlane();
scene.add(plane.group);
const flight = new FlightState();
flight.reset(START_POS.x, START_POS.y, START_POS.z, START_HEADING);
const audio = new GameAudio();

let state = shotParams ? 'shot' : 'title';
let cockpit = false;
let frozenFrames = 0;

// --- HUD and mission wiring ------------------------------------------------

const hud = new HUD({
  onStart: () => {
    audio.ensure();
    startSortie();
  },
  onResume: () => {
    state = 'playing';
    hud.hideScreens();
  },
  onRestart: () => startSortie(),
});

const missions = new Missions(world, {
  onRing: (done, total, score) => {
    audio.chime();
    hud.flash('RING ' + done + ' OF ' + total + '  +' + 500);
    hud.setObjective(
      done >= total
        ? 'All rings threaded — land on the runway'
        : 'Ring ' + (done + 1) + ' of ' + total + ' — thread the gold ring'
    );
  },
  onLand: () => {
    hud.flash('ALL RINGS DONE — LAND NOW');
    hud.setObjective('Land on the runway to complete the delivery');
  },
  onComplete: (stats) => {
    state = 'complete';
    hud.setCompleteStats(stats.score, stats.time, stats.fuel);
    hud.showScreen('complete');
    hud.setObjective('Delivery complete — welcome home');
  },
  onDamage: (damage, reason) => {
    hud.flash(reason);
    hud.setObjective('Airframe damaged — ' + damage + ' of 3 hits');
  },
  onCrash: (reason, score, ringsDone, ringTotal) => {
    state = 'crashed';
    hud.setCrashStats(reason, score, ringsDone, ringTotal);
    hud.showScreen('crash');
  },
  onRefuel: () => hud.flash('FUEL REFILLED'),
});

function startSortie() {
  flight.reset(START_POS.x, START_POS.y, START_POS.z, START_HEADING);
  missions.reset();
  cockpit = false;
  state = 'playing';
  hud.hideScreens();
  hud.setObjective('Fly through the glowing rings — 0 / 5');
  audio.ensure();
}

function resetSortie() {
  flight.reset(START_POS.x, START_POS.y, START_POS.z, START_HEADING);
  missions.reset();
  cockpit = false;
  hud.setObjective('Fly through the glowing rings — 0 / 5');
}

// --- input -----------------------------------------------------------------

const input = { mouseX: 0, mouseY: 0, throttleUp: false, throttleDown: false };

window.addEventListener('mousemove', (event) => {
  input.mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  input.mouseY = (event.clientY / window.innerHeight) * 2 - 1;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  switch (event.code) {
    case 'KeyW':
    case 'ArrowUp':
      input.throttleUp = true;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.throttleDown = true;
      break;
    case 'KeyC':
      if (state === 'playing') cockpit = !cockpit;
      break;
    case 'KeyP':
      if (state === 'playing') {
        state = 'paused';
        hud.showScreen('pause');
      } else if (state === 'paused') {
        state = 'playing';
        hud.hideScreens();
      }
      break;
    case 'KeyR':
      if (state === 'playing' || state === 'paused' || state === 'crashed' || state === 'complete') {
        startSortie();
      }
      break;
    case 'KeyM':
      audio.setMuted(!audio.muted);
      hud.flash(audio.muted ? 'SOUND OFF' : 'SOUND ON');
      break;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyW' || event.code === 'ArrowUp') input.throttleUp = false;
  if (event.code === 'KeyS' || event.code === 'ArrowDown') input.throttleDown = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- camera ----------------------------------------------------------------

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
const lookTarget = new THREE.Vector3();

function updateCamera(dt) {
  const fwd = {
    x: Math.sin(flight.heading),
    z: Math.cos(flight.heading),
  };
  const right = { x: -Math.cos(flight.heading), z: Math.sin(flight.heading) };
  if (cockpit) {
    camPos.set(
      flight.pos.x + fwd.x * 1.4,
      flight.pos.y + 1.05,
      flight.pos.z + fwd.z * 1.4
    );
    lookTarget.set(
      flight.pos.x + fwd.x * 60,
      flight.pos.y + 1 + flight.pitch * 30,
      flight.pos.z + fwd.z * 60
    );
    camera.position.lerp(camPos, Math.min(1, 18 * dt));
    camera.lookAt(lookTarget);
    return;
  }
  camPos.set(
    flight.pos.x - fwd.x * 13 + right.x * 0,
    flight.pos.y + 4.2,
    flight.pos.z - fwd.z * 13 + right.z * 0
  );
  lookTarget.set(
    flight.pos.x + fwd.x * 10,
    flight.pos.y + 1,
    flight.pos.z + fwd.z * 10
  );
  camera.position.lerp(camPos, Math.min(1, 5 * dt));
  camera.lookAt(lookTarget);
}

// --- main loop -------------------------------------------------------------

const clock = new THREE.Clock();
let elapsed = 0;

function placePlaneMesh() {
  plane.group.position.set(flight.pos.x, flight.pos.y, flight.pos.z);
  plane.group.rotation.y = flight.heading;
  plane.group.rotation.x = -flight.pitch;
  plane.group.rotation.z = -flight.roll;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (state === 'shot') {
    // Frozen pose: only the propeller, clouds and ring pulse move.
    frozenFrames++;
    plane.update(dt, flight.throttle, elapsed);
    world.update(dt, elapsed);
    placePlaneMesh();
    renderer.render(scene, camera);
    if (frozenFrames === 30) window.__shotReady = true;
    return;
  }

  if (state === 'playing') {
    flight.update(dt, input, terrainHeight);
    missions.update(dt, flight);
    plane.update(dt, flight.throttle, elapsed);
    world.update(dt, elapsed);
    placePlaneMesh();
    updateCamera(dt);
    hud.update(flight, missions);
    audio.update(flight.throttle, flight.speed);
  } else if (state === 'title') {
    // Slow orbit around the parked plane behind the title screen.
    const a = elapsed * 0.08;
    camera.position.set(
      START_POS.x + Math.sin(a) * 26,
      START_POS.y + 9,
      START_POS.z + Math.cos(a) * 26
    );
    camera.lookAt(START_POS.x, START_POS.y + 1, START_POS.z);
    plane.update(dt, 0.15, elapsed);
    world.update(dt, elapsed);
    placePlaneMesh();
  }
  renderer.render(scene, camera);
}

// --- boot ------------------------------------------------------------------

if (shotParams) {
  const game = {
    flight,
    world,
    plane,
    missions,
    hud,
    camera,
    resetSortie,
    setCameraPose: (pos, target) => {
      camera.position.set(pos.x, pos.y, pos.z);
      camera.lookAt(target.x, target.y, target.z);
    },
  };
  poseShot(game, shotParams.shot);
  placePlaneMesh();
  hud.update(flight, missions);
  state = 'shot';
} else {
  hud.showScreen('title');
}

animate();
