// Arcade flight model for Sembel Sky Courier.
// Throttle sets a target speed, mouse sets bank and pitch, the plane turns
// by banking. Slow flight stalls: the nose drops and the wing sinks.
// Ground handling, takeoff and touchdown classification live here too.

export const KNOTS_PER_MS = 1.94384;
export const FEET_PER_M = 3.28084;

const MAX_SPEED = 84;        // m/s at full throttle
const MIN_SPEED = 12;        // m/s at idle (taxi speed on the ground)
const STALL_SPEED = 24;      // m/s, below this the wing stops lifting
const TAKEOFF_SPEED = 27;    // m/s needed to lift off
const MAX_BANK = 1.05;       // radians, about 60 degrees
const MAX_PITCH = 0.42;      // radians, about 24 degrees
const GEAR_HEIGHT = 1.15;    // metres from ground to the plane origin

export class FlightState {
  constructor() {
    this.pos = { x: 0, y: 0, z: 0 };
    this.heading = Math.PI / 2; // facing +X, down the runway
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.touchdown = null; // filled on the frame a touchdown happens
    this.time = 0;
  }

  reset(startX, startY, startZ, heading) {
    this.pos.x = startX;
    this.pos.y = startY;
    this.pos.z = startZ;
    this.heading = heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.touchdown = null;
    this.time = 0;
  }

  // Gentle, slowly varying wind so the air never feels dead still.
  windAt(t) {
    return {
      x: 1.1 * Math.sin(t * 0.11) + 0.6 * Math.sin(t * 0.043 + 2.0),
      z: 0.9 * Math.cos(t * 0.09 + 0.5),
    };
  }

  // input: { mouseX, mouseY, throttleUp, throttleDown }
  // mouseX/mouseY are -1..1 (mouseY -1 is the top of the screen).
  // terrainHeight(x, z) is supplied by the world module.
  update(dt, input, terrainHeight) {
    this.time += dt;
    this.touchdown = null;

    // --- throttle ---
    if (input.throttleUp) this.throttle += 0.6 * dt;
    if (input.throttleDown) this.throttle -= 0.6 * dt;
    if (this.throttle > 1) this.throttle = 1;
    if (this.throttle < 0) this.throttle = 0;

    const stalled = !this.onGround && this.speed < STALL_SPEED;
    // Controls go mushy near the stall.
    const authority = this.onGround ? 1 : Math.min(1, Math.max(0.35, this.speed / STALL_SPEED));

    // --- bank and pitch targets from the mouse ---
    const targetRoll = input.mouseX * MAX_BANK * authority;
    const targetPitch = -input.mouseY * MAX_PITCH * authority;
    const rollRate = this.onGround ? 6 : 2.6;
    this.roll += (targetRoll - this.roll) * Math.min(1, rollRate * dt);
    if (stalled) {
      // A stalled wing drops its nose.
      this.pitch += (-0.14 - this.pitch) * Math.min(1, 1.6 * dt);
    } else {
      this.pitch += (targetPitch - this.pitch) * Math.min(1, 2.2 * dt);
    }

    // --- speed: throttle chases a target, climbing costs speed ---
    let targetSpeed = MIN_SPEED + this.throttle * (MAX_SPEED - MIN_SPEED);
    if (!this.onGround && this.pitch > 0) targetSpeed -= 14 * Math.sin(this.pitch);
    if (targetSpeed < 0) targetSpeed = 0;
    const accel = this.onGround ? 0.9 : 0.42;
    this.speed += (targetSpeed - this.speed) * Math.min(1, accel * dt);

    const wind = this.windAt(this.time);
    const groundH = terrainHeight(this.pos.x, this.pos.z);

    if (this.onGround) {
      // Taxi: gentle steering with the mouse, nose stays level.
      this.heading -= this.roll * 0.35 * dt * (0.3 + this.speed / 25);
      this.pitch = 0;
      this.roll *= 0.6;
      this.verticalSpeed = 0;
      this.pos.y = groundH + GEAR_HEIGHT;
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
      // Taxiing into the sea is a ditch, not a taxiway: count it as a
      // water touchdown (damage) and bounce back into the air.
      if (groundH < 0.5) {
        this.touchdown = {
          verticalSpeed: 0,
          speed: this.speed,
          onWater: true,
          soft: false,
          groundHeight: groundH,
        };
        this.onGround = false;
        this.pos.y = groundH + GEAR_HEIGHT + 4;
        this.verticalSpeed = 1.5;
        this.speed *= 0.55;
        return;
      }
      // Lift off once fast enough with the nose pulled up.
      if (this.speed > TAKEOFF_SPEED && this.throttle > 0.5 && input.mouseY < -0.12) {
        this.onGround = false;
        this.verticalSpeed = 2.5;
      }
      return;
    }

    // --- airborne: banked turn, pitch sets climb or descent ---
    const turnRate = (9.81 * Math.tan(this.roll)) / Math.max(this.speed, 15);
    this.heading -= turnRate * dt;

    let sink = 0;
    if (stalled) sink = (STALL_SPEED - this.speed) * 0.35;
    this.verticalSpeed = this.speed * Math.sin(this.pitch) - sink;

    const cosPitch = Math.cos(this.pitch);
    this.pos.x += Math.sin(this.heading) * this.speed * cosPitch * dt + wind.x * dt;
    this.pos.z += Math.cos(this.heading) * this.speed * cosPitch * dt + wind.z * dt;
    this.pos.y += this.verticalSpeed * dt;

    // --- touchdown / impact ---
    const floorY = groundH + GEAR_HEIGHT;
    if (this.pos.y <= floorY) {
      this.pos.y = floorY;
      const vs = this.verticalSpeed;
      const onWater = groundH < 0.5;
      const soft = !onWater && Math.abs(vs) <= 6 && this.speed <= 55;
      this.touchdown = {
        verticalSpeed: vs,
        speed: this.speed,
        onWater,
        soft,
        groundHeight: groundH,
      };
      if (soft) {
        this.onGround = true;
        this.verticalSpeed = 0;
        this.pitch = 0;
      } else {
        // Bounce back into the air, slower and a little shaken.
        this.pos.y = floorY + 4;
        this.verticalSpeed = 1.5;
        this.speed *= 0.55;
        this.pitch = 0.05;
      }
    }
  }

  speedKnots() {
    return this.speed * KNOTS_PER_MS;
  }

  altitudeFeet() {
    return Math.max(0, this.pos.y) * FEET_PER_M;
  }

  // Compass degrees: 0 = north (-Z), 90 = east (+X).
  compassDegrees() {
    let deg = 180 - (this.heading * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    return deg;
  }
}
