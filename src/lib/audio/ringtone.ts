/**
 * Timbre sintético usando Web Audio API.
 * Evita dependencia de un archivo .mp3 externo.
 * Patrón: tono doble europeo — 440Hz + 480Hz, 1s on / 1s off.
 */

let _ctx: AudioContext | null = null;
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _running = false;

function playBeep(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.25, now + 0.02);
  master.gain.setValueAtTime(0.25, now + 0.9);
  master.gain.linearRampToValueAtTime(0, now + 1.0);
  master.connect(ctx.destination);

  [440, 480].forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(master);
    osc.start(now);
    osc.stop(now + 1.0);
  });
}

export function startRingtone(): void {
  if (_running) return;
  _running = true;
  try {
    const ctx = new AudioContext();
    _ctx = ctx;
    playBeep(ctx);
    _intervalId = setInterval(() => {
      if (_ctx) playBeep(_ctx);
    }, 2000);
  } catch {}
}

export function stopRingtone(): void {
  _running = false;
  if (_intervalId !== null) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
  if (_ctx) {
    _ctx.close().catch(() => {});
    _ctx = null;
  }
}
