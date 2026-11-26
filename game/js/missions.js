// Mission logic: fly the ring sequence, then land on the runway.
// Score, timer, fuel burn, landing refuel, damage and crash detection.

import { RING_DEFS, RING_RADIUS, RUNWAY } from './world.js';

const FUEL_BURN_BASE = 0.08;      // per second at idle
const FUEL_BURN_THROTTLE = 0.32; // extra per second at full throttle
const RING_SCORE = 500;
const LANDING_SCORE = 1000;
const PAR_TIME = 300;            // seconds; faster finishes earn a time bonus

export class Missions {
  constructor(world, callbacks) {
    this.world = world;
    this.cb = callbacks; // { onRing, onLand, onComplete, onDamage, onCrash, onRefuel }
    this.ringTotal = RING_DEFS.length;
    this.reset();
  }

  reset() {
    this.ringsDone = 0;
    this.score = 0;
    this.elapsed = 0;
    this.fuel = 100;
    this.damage = 0;
    this.phase = 'rings'; // 'rings' -> 'land' -> 'done' | 'crashed'
    this.world.setActiveRing(0);
  }

  // Force a completed state (used by the end screenshot pose).
  forceComplete(score, elapsed, fuel) {
    this.ringsDone = this.ringTotal;
    this.score = score;
    this.elapsed = elapsed;
    this.fuel = fuel;
    this.phase = 'done';
    this.world.setActiveRing(this.ringTotal);
  }

  update(dt, flight) {
    if (this.phase === 'done' || this.phase === 'crashed') return;
    this.elapsed += dt;

    // Fuel burns with throttle; empty tanks mean the engine quits.
    this.fuel -= (FUEL_BURN_BASE + flight.throttle * FUEL_BURN_THROTTLE) * dt;
    if (this.fuel <= 0) {
      this.fuel = 0;
      flight.throttle = 0;
    }

    this.checkTouchdown(flight);

    // A gentle arrival on the strip completes the delivery even if the
    // wheels first touched grass and the plane taxied on.
    if (
      this.phase === 'land' &&
      flight.onGround &&
      this.onRunway(flight) &&
      flight.speed < 40
    ) {
      this.completeDelivery();
    }

    if (this.phase === 'rings') {
      this.checkRing(flight);
    }
  }

  checkRing(flight) {
    const ring = RING_DEFS[this.ringsDone];
    const dx = flight.pos.x - ring.x;
    const dy = flight.pos.y - ring.y;
    const dz = flight.pos.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < RING_RADIUS + 2) {
      this.ringsDone++;
      this.score += RING_SCORE;
      this.cb.onRing(this.ringsDone, this.ringTotal, this.score);
      if (this.ringsDone >= this.ringTotal) {
        this.phase = 'land';
        this.world.setActiveRing(this.ringTotal);
        this.cb.onLand();
      } else {
        this.world.setActiveRing(this.ringsDone);
      }
    }
  }

  checkTouchdown(flight) {
    const td = flight.touchdown;
    if (!td) return;
    if (td.onWater) {
      this.registerDamage('Ditched in the sea — the courier is a write-off for now.');
      return;
    }
    if (!td.soft) {
      const hard = td.verticalSpeed < -10 || td.speed > 55;
      this.registerDamage(
        hard
          ? 'Hard impact — the airframe took a beating.'
          : 'Rough touchdown — watch the descent rate.'
      );
      return;
    }
    // A soft touchdown refuels the plane.
    if (this.fuel < 100) {
      this.fuel = 100;
      this.cb.onRefuel();
    }
    // Landing on the runway after the rings completes the delivery.
    if (this.phase === 'land' && this.onRunway(flight) && flight.speed < 40) {
      this.completeDelivery();
    }
  }

  onRunway(flight) {
    return (
      Math.abs(flight.pos.x - RUNWAY.x) <= RUNWAY.length / 2 &&
      Math.abs(flight.pos.z - RUNWAY.z) <= RUNWAY.width / 2 + 6
    );
  }

  completeDelivery() {
    const timeBonus = Math.max(0, Math.round((PAR_TIME - this.elapsed) * 5));
    const fuelBonus = Math.round(this.fuel * 10);
    this.score += LANDING_SCORE + timeBonus + fuelBonus;
    this.phase = 'done';
    this.cb.onComplete({
      score: this.score,
      time: this.elapsed,
      fuel: this.fuel,
      timeBonus,
      fuelBonus,
    });
  }

  registerDamage(reason) {
    this.damage++;
    if (this.damage >= 3) {
      this.phase = 'crashed';
      this.cb.onCrash(reason, this.score, this.ringsDone, this.ringTotal);
    } else {
      this.cb.onDamage(this.damage, reason);
    }
  }
}
