// Tiny synthesized SFX — no assets. Resumes on the first user gesture.
let actx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('dg_mute') === '1'; } catch { /* private mode */ }

function ac(): AudioContext | null {
  if (!actx) {
    try {
      actx = new AudioContext();
      master = actx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(actx.destination);
    } catch {
      return null;
    }
  }
  return actx;
}

export function unlockAudio() {
  const a = ac();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('dg_mute', m ? '1' : '0'); } catch { /* ignore */ }
  if (master) master.gain.value = m ? 0 : 0.5;
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const a = ac();
  if (!a || !master) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, hp = 800) {
  const a = ac();
  if (!a || !master) return;
  const n = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  putt(power: number) {
    tone(180 + power * 120, 0.08, 'square', 0.15 + power * 0.2, 90);
    noise(0.05, 0.12 + power * 0.15, 1500);
  },
  wall(imp: number) {
    const v = Math.min(1, imp / 25);
    tone(140 + v * 80, 0.07, 'triangle', 0.1 + v * 0.3, 70);
    noise(0.04, 0.05 + v * 0.15, 2500);
  },
  bumper() {
    tone(660, 0.12, 'square', 0.25, 990);
    tone(1320, 0.18, 'sine', 0.15, 660, 0.03);
  },
  jump() { tone(300, 0.25, 'sawtooth', 0.15, 900); },
  land() { noise(0.06, 0.15, 400); },
  tele() { tone(1200, 0.3, 'sine', 0.2, 200); tone(200, 0.3, 'sine', 0.15, 1400, 0.1); },
  water() { noise(0.35, 0.3, 300); tone(400, 0.3, 'sine', 0.15, 80); },
  boost() { tone(220, 0.2, 'sawtooth', 0.12, 660); },
  holed(score: number, par: number) {
    tone(520, 0.1, 'triangle', 0.2);
    tone(780, 0.1, 'triangle', 0.2, undefined, 0.09);
    tone(1040, 0.25, 'triangle', 0.25, undefined, 0.18);
    if (score <= par - 1) { tone(1560, 0.4, 'sine', 0.2, undefined, 0.3); tone(2080, 0.5, 'sine', 0.15, undefined, 0.42); }
  },
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.22, undefined, i * 0.13));
    tone(1318, 0.8, 'sine', 0.2, undefined, 0.55);
  },
  ui() { tone(880, 0.05, 'sine', 0.12); },
  tick() { tone(1200, 0.04, 'square', 0.06); },
  error() { tone(200, 0.2, 'square', 0.15, 120); },
  reset() { tone(300, 0.15, 'sine', 0.12, 150); },
};
