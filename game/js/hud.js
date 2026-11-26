// HUD: DOM gauges, compass strip, artificial horizon canvas, centre flash
// messages and the title / pause / complete / crash screens.

import { KNOTS_PER_MS, FEET_PER_M } from './flight.js';

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function compassLabel(deg) {
  if (deg === 0) return 'N';
  if (deg === 90) return 'E';
  if (deg === 180) return 'S';
  if (deg === 270) return 'W';
  return String(deg).padStart(3, '0');
}

export class HUD {
  constructor(callbacks) {
    this.cb = callbacks;
    this.el = {
      hud: document.getElementById('hud'),
      speed: document.getElementById('speed'),
      alt: document.getElementById('alt'),
      headingText: document.getElementById('heading-text'),
      compass: document.getElementById('compass'),
      fuelFill: document.getElementById('fuel-fill'),
      fuelText: document.getElementById('fuel-text'),
      thrFill: document.getElementById('thr-fill'),
      thrText: document.getElementById('thr-text'),
      damageText: document.getElementById('damage-text'),
      score: document.getElementById('score'),
      time: document.getElementById('time'),
      rings: document.getElementById('rings'),
      objective: document.getElementById('objective'),
      horizon: document.getElementById('horizon'),
      flash: document.getElementById('flash'),
      title: document.getElementById('screen-title'),
      pause: document.getElementById('screen-pause'),
      complete: document.getElementById('screen-complete'),
      crash: document.getElementById('screen-crash'),
    };
    this.compassCtx = this.el.compass.getContext('2d');
    this.horizonCtx = this.el.horizon.getContext('2d');
    this.flashTimer = 0;

    document.getElementById('btn-start').addEventListener('click', () => this.cb.onStart());
    document.getElementById('btn-resume').addEventListener('click', () => this.cb.onResume());
    document.getElementById('btn-restart-pause').addEventListener('click', () => this.cb.onRestart());
    document.getElementById('btn-again').addEventListener('click', () => this.cb.onRestart());
    document.getElementById('btn-retry').addEventListener('click', () => this.cb.onRestart());
  }

  showScreen(name) {
    const map = {
      title: this.el.title,
      pause: this.el.pause,
      complete: this.el.complete,
      crash: this.el.crash,
    };
    for (const key of Object.keys(map)) {
      map[key].classList.toggle('hidden', key !== name);
    }
    this.el.hud.classList.toggle('hidden', name === 'title');
  }

  hideScreens() {
    this.showScreen(null);
  }

  flash(message) {
    this.el.flash.textContent = message;
    this.el.flash.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.el.flash.classList.remove('show'), 1600);
  }

  setObjective(text) {
    this.el.objective.textContent = text;
  }

  setCompleteStats(score, time, fuel) {
    document.getElementById('final-score').textContent = String(score);
    document.getElementById('final-time').textContent = formatTime(time);
    document.getElementById('final-fuel').textContent = Math.round(fuel) + '%';
  }

  setCrashStats(reason, score, ringsDone, ringsTotal) {
    document.getElementById('crash-reason').textContent = reason;
    document.getElementById('crash-score').textContent = String(score);
    document.getElementById('crash-rings').textContent = ringsDone + ' / ' + ringsTotal;
  }

  drawCompass(headingDeg) {
    const ctx = this.compassCtx;
    const W = 260;
    const H = 36;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    for (let d = -45; d <= 45; d += 5) {
      const deg = ((Math.round(headingDeg) + d) % 360 + 360) % 360;
      const x = W / 2 + d * 2.6;
      const major = deg % 30 === 0;
      ctx.beginPath();
      ctx.moveTo(x, H - 8);
      ctx.lineTo(x, H - (major ? 20 : 13));
      ctx.stroke();
      if (major) ctx.fillText(compassLabel(deg), x, 12);
    }
    // Centre marker.
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 6, 0);
    ctx.lineTo(W / 2 + 6, 0);
    ctx.lineTo(W / 2, 8);
    ctx.closePath();
    ctx.fill();
  }

  drawHorizon(pitch, roll) {
    const ctx = this.horizonCtx;
    const S = 132;
    const C = S / 2;
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(C, C);
    ctx.rotate(-roll);
    // Pitch moves the horizon down when the nose rises.
    ctx.translate(0, pitch * 90);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-C - 10, -C - 110, S + 20, C + 110);
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(-C - 10, 0, S + 20, C + 110);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-C - 10, 0);
    ctx.lineTo(C + 10, 0);
    ctx.stroke();
    ctx.restore();
    // Fixed aircraft symbol in the middle.
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(C - 26, C);
    ctx.lineTo(C - 8, C);
    ctx.moveTo(C + 8, C);
    ctx.lineTo(C + 26, C);
    ctx.moveTo(C, C - 4);
    ctx.lineTo(C, C + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(C, C, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();
  }

  update(flight, missions) {
    this.el.speed.textContent = String(Math.round(flight.speed * KNOTS_PER_MS));
    this.el.alt.textContent = String(Math.round(Math.max(0, flight.pos.y) * FEET_PER_M));
    const hdg = flight.compassDegrees();
    this.el.headingText.textContent = 'HDG ' + String(Math.round(hdg)).padStart(3, '0') + '°';
    this.drawCompass(hdg);
    this.drawHorizon(flight.pitch, flight.roll);

    const fuel = missions.fuel;
    this.el.fuelFill.style.width = Math.max(0, fuel) + '%';
    this.el.fuelFill.classList.toggle('low', fuel < 25);
    this.el.fuelText.textContent = Math.round(fuel) + '%';
    this.el.thrFill.style.width = Math.round(flight.throttle * 100) + '%';
    this.el.thrText.textContent = Math.round(flight.throttle * 100) + '%';

    const dots = document.querySelectorAll('#damage-dots .dot');
    dots.forEach((dot, i) => dot.classList.toggle('hit', i < missions.damage));
    this.el.damageText.textContent =
      missions.damage === 0 ? 'No damage'
      : missions.damage === 1 ? '1 hard hit'
      : missions.damage + ' hard hits';

    this.el.score.textContent = String(missions.score);
    this.el.time.textContent = formatTime(missions.elapsed);
    this.el.rings.textContent = missions.ringsDone + ' / ' + missions.ringTotal;
  }
}
