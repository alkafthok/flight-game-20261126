// The courier plane, built from three.js primitives: orange fuselage,
// cream wings, dark glass canopy, spinning propeller, red/green nav lights
// and a blinking tail strobe. Faces +Z; heading rotates it around Y.

import * as THREE from 'three';

export function buildPlane() {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const orange = new THREE.MeshLambertMaterial({ color: 0xe2603a });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a3540 });
  const glass = new THREE.MeshPhongMaterial({
    color: 0x1c2f42,
    shininess: 120,
    specular: 0xaaccdd,
  });
  const metal = new THREE.MeshLambertMaterial({ color: 0x3c3c3c });

  // Fuselage: tapered cylinder along Z, nose cone at the front.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.32, 4.6, 12), orange);
  fuselage.rotation.x = Math.PI / 2;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 12), orange);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 2.95;
  group.add(nose);

  // Canopy: squashed dark-glass dome on top, slightly forward.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 10), glass);
  canopy.scale.set(1, 0.72, 1.7);
  canopy.position.set(0, 0.52, 0.7);
  group.add(canopy);

  // Main wing and tail surfaces.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.18, 1.5), cream);
  wing.position.set(0, -0.05, 0.25);
  group.add(wing);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.95), cream);
  tailplane.position.set(0, 0.18, -2.15);
  group.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 1.05), orange);
  fin.position.set(0, 0.62, -2.15);
  group.add(fin);

  // Belly stripe so the plane reads from below too.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 4.4), cream);
  stripe.position.set(0, -0.55, 0.1);
  group.add(stripe);

  // Propeller: hub + two blades, spins around Z at the nose.
  const prop = new THREE.Group();
  prop.position.z = 3.65;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), metal);
  prop.add(hub);
  // One long thin box through the hub reads as a two-blade propeller.
  const blade = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 2.7, 0.07),
    new THREE.MeshLambertMaterial({ color: 0x222222 })
  );
  blade.rotation.x = 0.35; // slight twist so it looks like it bites the air
  prop.add(blade);
  group.add(prop);

  // Nav lights: red on the left (port) tip, green on the right.
  const navLeft = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a })
  );
  navLeft.position.set(-3.7, -0.05, 0.25);
  group.add(navLeft);
  const navRight = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x2aff5a })
  );
  navRight.position.set(3.7, -0.05, 0.25);
  group.add(navRight);
  // Tail strobe, blinks once a second.
  const strobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  strobe.position.set(0, 0.3, -2.35);
  group.add(strobe);

  // Fixed landing gear: two mains + tail wheel.
  const gearMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), metal);
    leg.position.set(sx * 0.7, -0.85, 0.9);
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10), gearMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * 0.7, -1.2, 0.9);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), gearMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.62, -2.1);
  group.add(tailWheel);

  const plane = {
    group,
    prop,
    strobe,
    update(dt, throttle, time) {
      // Propeller spins faster with throttle, idles slowly on the ground.
      prop.rotation.z -= dt * (5 + throttle * 46);
      strobe.visible = time % 1.2 < 0.12;
    },
  };
  return plane;
}
