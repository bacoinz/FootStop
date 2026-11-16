// Football sound effects synthesized with Web Audio (no audio files): referee whistle, ball,
// crowd, scoreboard flaps and marimba notes, with a touch of stadium reverb.
import { getMuted } from "./identity.ts";

let muted = getMuted();

export function setSoundMuted(m: boolean) {
  muted = m;
}

/** Where a sound is rendered: live output or an offline context (used to check levels). */
interface Out {
  ac: BaseAudioContext;
  /** Dry bus (goes through the soft master chain). */
  dry: AudioNode;
  /** Reverb send, for crowd and whistles. */
  wet: AudioNode;
}

let live: Out | null = null;
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function buildChain(ac: BaseAudioContext): Out {
  // Gentle master: a little headroom, top end rounded off, compressor to keep peaks polite.
  const master = ac.createGain();
  master.gain.value = 1;
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 7000;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  master.connect(tone).connect(comp).connect(ac.destination);

  // Short, dark "stadium" reverb from decaying noise.
  const verb = ac.createConvolver();
  const len = Math.floor(ac.sampleRate * 1.6);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  verb.buffer = ir;
  const wet = ac.createGain();
  wet.gain.value = 0.22;
  wet.connect(verb).connect(master);
  return { ac, dry: master, wet };
}

function out(): Out | null {
  if (muted) return null;
  try {
    if (!live) live = buildChain(new AudioContext());
    const ac = live.ac as AudioContext;
    if (ac.state === "suspended") void ac.resume();
    return live;
  } catch {
    return null;
  }
}

function noise(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = buf.getChannelData(0);
    // Slightly pinkish noise: softer than white.
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      d[i] = last * 6 + (Math.random() * 2 - 1) * 0.15;
    }
    noiseCache.set(ac, buf);
  }
  return buf;
}

/** Attack–release envelope on a gain param. */
function envelope(g: AudioParam, t: number, peak: number, attack: number, dur: number, release: number) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(peak, t + attack);
  g.setValueAtTime(peak, t + Math.max(attack, dur - release));
  g.exponentialRampToValueAtTime(0.0001, t + dur);
}

function toneAt(
  o: Out,
  t: number,
  freq: number,
  dur: number,
  gain: number,
  { type = "sine" as OscillatorType, attack = 0.005, slideTo = 0, wet = false } = {},
) {
  const osc = o.ac.createOscillator();
  const g = o.ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o.dry);
  if (wet) g.connect(o.wet);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noiseAt(
  o: Out,
  t: number,
  dur: number,
  gain: number,
  {
    type = "bandpass" as BiquadFilterType,
    freq = 1000,
    freqTo = 0,
    q = 1,
    attack = 0.01,
    release = dur * 0.6,
    wet = false,
  } = {},
) {
  const src = o.ac.createBufferSource();
  src.buffer = noise(o.ac);
  const f = o.ac.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = o.ac.createGain();
  envelope(g.gain, t, gain, attack, dur, release);
  src.connect(f).connect(g).connect(o.dry);
  if (wet) g.connect(o.wet);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

// --- Building blocks ---------------------------------------------------------

/** Referee pea whistle: a pure tone trilled by the pea, plus a little breath. */
function whistle(o: Out, t: number, dur: number, gain = 0.07) {
  const osc = o.ac.createOscillator();
  osc.frequency.value = 2750;
  const trill = o.ac.createOscillator();
  trill.frequency.value = 34;
  const depth = o.ac.createGain();
  depth.gain.value = 70;
  trill.connect(depth).connect(osc.frequency);
  const g = o.ac.createGain();
  envelope(g.gain, t, gain, 0.025, dur, 0.07);
  osc.connect(g).connect(o.dry);
  g.connect(o.wet);
  osc.start(t);
  trill.start(t);
  osc.stop(t + dur + 0.05);
  trill.stop(t + dur + 0.05);
  noiseAt(o, t, dur, gain * 0.18, { freq: 2800, q: 3, attack: 0.02, release: 0.06 });
}

/** Foot on ball: a soft low thump. */
function kick(o: Out, t: number, gain = 0.28) {
  toneAt(o, t, 140, 0.16, gain, { slideTo: 55, attack: 0.003 });
  noiseAt(o, t, 0.03, gain * 0.12, { type: "lowpass", freq: 1200, attack: 0.002, release: 0.02 });
}

/** Crowd cheer: broadband noise swelling in and fading out, with stadium reverb. */
function cheer(o: Out, t: number, dur: number, gain = 0.09) {
  noiseAt(o, t, dur, gain, { freq: 850, q: 0.6, attack: dur * 0.18, release: dur * 0.65, wet: true });
  noiseAt(o, t + 0.05, dur, gain * 0.45, { freq: 2100, q: 0.9, attack: dur * 0.2, release: dur * 0.6, wet: true });
}

/** Crowd "ooooh": a band of noise sliding down. */
function groan(o: Out, t: number, gain = 0.08) {
  noiseAt(o, t, 1.1, gain, { freq: 720, freqTo: 320, q: 1.4, attack: 0.15, release: 0.7, wet: true });
}

/** Marimba-like note: sine with a quick-decaying 4th harmonic. */
function marimba(o: Out, t: number, freq: number, gain = 0.06) {
  toneAt(o, t, freq, 0.7, gain, { attack: 0.004 });
  toneAt(o, t, freq * 4, 0.12, gain * 0.25, { attack: 0.002 });
}

/** Airy whoosh (a card flying across the table). */
function whoosh(o: Out, t: number, gain = 0.05) {
  noiseAt(o, t, 0.35, gain, { freq: 500, freqTo: 2600, q: 1.2, attack: 0.12, release: 0.2 });
}

const NOTE = { D4: 293.66, G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5 };

// --- Effects -----------------------------------------------------------------

type Effect = (o: Out, t: number) => void;

let tickAlt = false;

const effects = {
  /** Last seconds of the clock: wooden tick-tock. */
  tick: (o, t) => {
    tickAlt = !tickAlt;
    toneAt(o, t, tickAlt ? 1150 : 880, 0.05, 0.07, { type: "triangle", attack: 0.002 });
  },
  /** Your turn: a short, bright ping. */
  turn: (o, t) => {
    marimba(o, t, NOTE.G5, 0.05);
    marimba(o, t + 0.07, NOTE.C6, 0.04);
  },
  /** Right answer: the ball is passed with the foot to the next player (kick + roll). */
  pass: (o, t) => {
    kick(o, t, 0.3);
    noiseAt(o, t + 0.03, 0.32, 0.035, { type: "lowpass", freq: 900, freqTo: 300, attack: 0.02, release: 0.25 });
    toneAt(o, t + 0.12, 90, 0.18, 0.08, { slideTo: 60, attack: 0.005 });
  },
  /** Wrong name: a dull "doink". */
  wrong: (o, t) => {
    toneAt(o, t, 220, 0.16, 0.12, { type: "triangle", slideTo: 150, attack: 0.004 });
    noiseAt(o, t, 0.06, 0.04, { type: "lowpass", freq: 700, attack: 0.002, release: 0.05 });
  },
  /** Ambiguous: two soft questioning notes. */
  ambiguous: (o, t) => {
    marimba(o, t, NOTE.E5, 0.045);
    marimba(o, t + 0.12, NOTE.G5, 0.045);
  },
  /** Pass button: a soft touch sending the ball on, and a falling note. */
  skip: (o, t) => {
    kick(o, t, 0.18);
    whoosh(o, t + 0.02, 0.035);
    marimba(o, t + 0.1, NOTE.D4, 0.04);
  },
  /** Knocked out: a long referee whistle and the crowd sighing. */
  out: (o, t) => {
    whistle(o, t, 0.55, 0.065);
    groan(o, t + 0.3, 0.06);
  },
  /** Round over: goal! crowd roar, then the three blasts of the final whistle. */
  goal: (o, t) => {
    kick(o, t, 0.34);
    noiseAt(o, t + 0.05, 0.12, 0.06, { type: "highpass", freq: 3000, attack: 0.002, release: 0.08 });
    cheer(o, t + 0.1, 2.6, 0.12);
    whistle(o, t + 1.3, 0.2);
    whistle(o, t + 1.6, 0.2);
    whistle(o, t + 1.9, 0.75);
  },
  /** The draw: a flap of the scoreboard turning over. */
  flip: (o, t) => {
    noiseAt(o, t, 0.025, 0.05, { freq: 2600, q: 1.8, attack: 0.001, release: 0.02 });
    toneAt(o, t, 700, 0.03, 0.03, { type: "triangle", attack: 0.001 });
  },
  /** The draw stops on the round's letter or category. */
  reveal: (o, t) => {
    toneAt(o, t, 1200, 0.03, 0.06, { type: "triangle", attack: 0.001 });
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => marimba(o, t + 0.05 + i * 0.06, f, 0.05));
  },
  /** 3-2-1 beeps. */
  count: (o, t) => toneAt(o, t, 660, 0.12, 0.07, { type: "sine", attack: 0.004 }),
  /** Kick-off whistle. */
  kickoff: (o, t) => whistle(o, t, 0.35),
  /** Trump card: a card flicked on the table and a sparkle. */
  trump: (o, t) => {
    whoosh(o, t, 0.06);
    [NOTE.G5, NOTE.C6, NOTE.E5 * 2].forEach((f, i) => marimba(o, t + 0.15 + i * 0.05, f, 0.035));
  },
  /** Solo: a round lost. */
  life: (o, t) => {
    whistle(o, t, 0.25, 0.06);
    groan(o, t + 0.15, 0.07);
    marimba(o, t + 0.3, NOTE.D4, 0.05);
  },
  /** End of the game: big cheer and a chord. */
  win: (o, t) => {
    cheer(o, t, 3.2, 0.11);
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => marimba(o, t + 0.2 + i * 0.09, f, 0.05));
  },
} satisfies Record<string, Effect>;

function play(effect: Effect) {
  const o = out();
  if (!o) return;
  effect(o, o.ac.currentTime + 0.02);
}

export type SoundName = keyof typeof effects;

export const sfx = Object.fromEntries(Object.keys(effects).map((k) => [k, () => play(effects[k as SoundName])])) as Record<SoundName, () => void>;

/** Unlocks audio on the first user gesture (browsers start AudioContext suspended). */
export function unlockAudio() {
  const o = out();
  if (o && (o.ac as AudioContext).state === "suspended") void (o.ac as AudioContext).resume();
}

/** Renders every effect offline and reports peak/RMS levels (dev tool: window.__fstSoundLevels()). */
export async function measureLevels() {
  const report: Record<string, { peak: number; rms: number }> = {};
  for (const [name, effect] of Object.entries(effects) as [string, Effect][]) {
    const ac = new OfflineAudioContext(2, 44100 * 4.5, 44100);
    effect(buildChain(ac), 0.02);
    const buf = await ac.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (const v of d) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    report[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  }
  return report;
}

if (import.meta.env.DEV) (window as any).__fstSoundLevels = measureLevels;
