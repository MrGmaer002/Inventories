let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freqs: Array<[number, number]>, type: OscillatorType, durMs: number, vol: number): void {
  const ac = ensureCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.connect(gain);
  gain.connect(ac.destination);
  const start = ac.currentTime;
  freqs.forEach(([f, at]) => osc.frequency.setValueAtTime(f, start + at / 1000));
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durMs / 1000);
  osc.start(start);
  osc.stop(start + durMs / 1000 + 0.05);
}

export function playSound(kind: 'click' | 'cash' | 'success' | 'error'): void {
  switch (kind) {
    case 'click':
      tone([[600, 0]], 'sine', 60, 0.08);
      break;
    case 'cash':
      tone([[987.77, 0], [1318.51, 90]], 'triangle', 320, 0.14);
      break;
    case 'success':
      tone([[523.25, 0], [659.25, 90], [783.99, 180]], 'sine', 240, 0.1);
      break;
    case 'error':
      tone([[220, 0], [180, 120]], 'sawtooth', 240, 0.08);
      break;
  }
}
