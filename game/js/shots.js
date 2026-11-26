// Screenshot poses: deterministic frozen scenes for ?shot=start|play|end.
// start = plane on the runway, engines running, runway ahead.
// play  = mid-flight chasing the first ring over the islands, full HUD.
// end   = landed with the mission-complete score visible.
// Gameplay is frozen in shot mode; only the propeller, clouds and the
// active ring keep animating so the frame stays alive for the capture.

export function getShotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (shot !== 'start' && shot !== 'play' && shot !== 'end') return null;
  const seed = parseInt(q.get('seed') || '7', 10) || 7;
  return { shot, seed };
}

function forwardOf(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

function rightOf(heading) {
  return { x: -Math.cos(heading), z: Math.sin(heading) };
}

export function poseShot(game, shot) {
  game.resetSortie();
  const f = game.flight;
  const hud = game.hud;

  if (shot === 'start') {
    // On the runway threshold, throttle up, propeller turning.
    f.throttle = 0.4;
    f.speed = 0;
    f.onGround = true;
    hud.hideScreens();
    hud.setObjective('Fly through the glowing rings — 0 / 5');
    const fwd = forwardOf(f.heading);
    const right = rightOf(f.heading);
    game.setCameraPose(
      {
        x: f.pos.x - fwd.x * 14 + right.x * 3,
        y: f.pos.y + 5,
        z: f.pos.z - fwd.z * 14 + right.z * 3,
      },
      { x: f.pos.x + fwd.x * 45, y: f.pos.y, z: f.pos.z + fwd.z * 45 }
    );
  }

  if (shot === 'play') {
    // Mid-flight, climbing toward the first ring with the islands below.
    f.pos.x = 300;
    f.pos.y = 70;
    f.pos.z = 60;
    f.heading = Math.atan2(420 - 300, 100 - 60);
    f.speed = 55;
    f.throttle = 0.65;
    f.pitch = 0.02;
    f.roll = 0.12;
    f.onGround = false;
    game.missions.elapsed = 47;
    hud.hideScreens();
    hud.setObjective('Ring 1 of 5 — thread the gold ring');
    const fwd = forwardOf(f.heading);
    game.setCameraPose(
      { x: f.pos.x - fwd.x * 13, y: f.pos.y + 4.2, z: f.pos.z - fwd.z * 13 },
      { x: f.pos.x + fwd.x * 14, y: f.pos.y, z: f.pos.z + fwd.z * 14 }
    );
  }

  if (shot === 'end') {
    // Back on the runway, delivery complete, score on screen.
    game.missions.forceComplete(2850, 163, 62);
    f.pos.x = 40;
    f.pos.y = 5.1;
    f.pos.z = 120;
    f.heading = Math.PI / 2;
    f.speed = 0;
    f.throttle = 0;
    f.onGround = true;
    hud.setCompleteStats(2850, 163, 62);
    hud.showScreen('complete');
    hud.setObjective('Delivery complete — welcome home');
    const fwd = forwardOf(f.heading);
    const right = rightOf(f.heading);
    // Look slightly above the plane so it reads below the centred panel.
    game.setCameraPose(
      {
        x: f.pos.x - fwd.x * 14 + right.x * -8,
        y: f.pos.y + 5,
        z: f.pos.z - fwd.z * 14 + right.z * -8,
      },
      { x: f.pos.x + fwd.x * 18 + right.x * 8, y: f.pos.y + 2.5, z: f.pos.z + fwd.z * 18 + right.z * 8 }
    );
  }
}
