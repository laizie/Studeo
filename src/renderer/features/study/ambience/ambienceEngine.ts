import { type AmbienceId, fillPinkNoise, fillBrownNoise } from '../../../../shared/ambience';
import rainUrl from '../../../assets/ambience/rain.opus';
import beachUrl from '../../../assets/ambience/beach.opus';

// Sounds backed by a bundled recording rather than synthesis. To add another, drop
// the loop in assets/ambience/, add its id to AmbienceId + AMBIENCE_SOUNDS, and map
// it here — the engine handles the rest.
const FILE_SOUNDS: Partial<Record<AmbienceId, string>> = {
  rain: rainUrl,
  beach: beachUrl,
};

// How long the two copies of a file overlap when we stitch a loop. The .opus files are
// already seamless loops, so this only has to bridge the small gap Chromium leaves when a
// media element restarts — a short overlap does it without audibly doubling the texture.
// Lengthen it if a loop ever dips or clicks at the seam; shorten it to reduce doubling.
const CROSSFADE_SEC = 0.7;
// How often we check whether the playing copy is close enough to its end to start the
// crossfade. Media-element time is coarse, but ambience is slow — 50ms is imperceptible.
const SCHEDULER_MS = 50;

// Equal-power (constant-loudness) fade shapes. A plain linear crossfade of two copies of
// the same recording dips ~3–6 dB in the middle (the signals aren't phase-aligned, so they
// don't sum to full amplitude); sin/cos ramps keep perceived loudness steady through the
// overlap. Precomputed once and replayed with setValueCurveAtTime.
function makeFadeCurve(fadeIn: boolean, steps = 64): Float32Array {
  const c = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const x = i / (steps - 1);
    c[i] = fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2);
  }
  return c;
}
const FADE_IN_CURVE = makeFadeCurve(true);
const FADE_OUT_CURVE = makeFadeCurve(false);

// A file-backed sound, built once and reused. It's two <audio> copies of the same loop,
// each with its own gain, mixed into one output. We ping-pong: one copy plays as "lead"
// while the other waits silent; near the lead's end we start the waiting copy from the top
// and crossfade the gains, then swap roles. The seam is always hidden under an overlap.
interface FileVoice {
  els: [HTMLAudioElement, HTMLAudioElement];
  gains: [GainNode, GainNode];
  out: GainNode;
  /** Index (0|1) of the copy currently in front. */
  active: 0 | 1;
  /** True while a crossfade is mid-flight, so the scheduler doesn't start a second one. */
  crossfading: boolean;
}

// Imperative Web Audio engine for Focus Mode ambience. One AudioContext, created lazily on
// first play (browsers only allow audio to start from a user gesture — a chip click
// qualifies). Each sound is a small graph feeding a master gain we ramp for click-free
// fades: Wind/Brown are synthesized looping noise buffers; Rain/Beach are bundled .opus
// recordings played through <audio> elements (a media element loads file:// in a packaged
// build, where fetch()+decodeAudioData would not) and loop-stitched with a crossfade.
//
// State is deliberately module-level (a singleton): there's only ever one room, and
// keeping the AudioContext out of React means re-renders can't tear down playback.
class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Live sources + LFOs for the current synthesized sound, stopped on switch/stop. */
  private nodes: AudioScheduledSourceNode[] = [];
  private current: AmbienceId | null = null;
  private volume = 0.6;
  // File-backed sounds. Each voice's elements + source nodes are created once
  // (createMediaElementSource may only be called once per element) and reused, keyed by id.
  private voices = new Map<AmbienceId, FileVoice>();
  /** The voice currently looping, watched by the crossfade scheduler. */
  private activeVoice: FileVoice | null = null;
  private scheduler: ReturnType<typeof setInterval> | null = null;

  private ensure(): { ctx: AudioContext; master: GainNode } {
    let ctx = this.ctx;
    let master = this.master;
    if (!ctx || !master) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0; // fade up from silence on the first play
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, master };
  }

  // A few seconds of noise, looped. Long enough that any low-frequency seam in brown
  // noise is rare and subtle; short enough to stay tiny in memory.
  private loopSource(ctx: AudioContext, kind: 'pink' | 'brown'): AudioBufferSourceNode {
    const len = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    if (kind === 'pink') fillPinkNoise(data);
    else fillBrownNoise(data);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  private filter(ctx: AudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    return f;
  }

  // Get (or lazily build) the two-copy crossfade voice for a file-backed sound. Built once
  // per id and reused: createMediaElementSource throws if called twice on one element, and
  // rebuilding would drop the buffered audio.
  private ensureVoice(ctx: AudioContext, master: GainNode, id: AmbienceId, url: string): FileVoice {
    let voice = this.voices.get(id);
    if (!voice) {
      const out = ctx.createGain();
      out.gain.value = 1;
      out.connect(master);
      // Build one <audio> copy wired through its own gain into the shared output.
      const build = (): [HTMLAudioElement, GainNode] => {
        const el = new Audio(url);
        el.loop = false; // we stitch the loop ourselves via crossfade, not the element
        el.preload = 'auto';
        const g = ctx.createGain();
        g.gain.value = 0;
        const source = ctx.createMediaElementSource(el);
        source.connect(g);
        g.connect(out);
        return [el, g];
      };
      const [el0, g0] = build();
      const [el1, g1] = build();
      voice = { els: [el0, el1], gains: [g0, g1], out, active: 0, crossfading: false };
      this.voices.set(id, voice);
    }
    return voice;
  }

  /** Start (or switch to) a sound. Switching under a steady master gain is inaudibly
   *  smooth, so we don't dip the volume between sounds. */
  play(id: AmbienceId): void {
    const { ctx, master } = this.ensure();
    this.stopNodes();
    this.current = id;

    const fileUrl = FILE_SOUNDS[id];
    if (fileUrl) {
      this.playFile(ctx, master, id, fileUrl);
    } else {
      // A per-sound gain lets LFOs modulate amplitude without touching master (volume).
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(master);
      if (id === 'brown') {
        const src = this.loopSource(ctx, 'brown');
        // Roll off the highs so it's a deep, warm rumble instead of a hiss ("static").
        const warm = this.filter(ctx, 'lowpass', 450);
        src.connect(warm); warm.connect(g);
        src.start(); this.nodes.push(src);
      } else { // wind
        const src = this.loopSource(ctx, 'brown');
        const lp = this.filter(ctx, 'lowpass', 500);
        src.connect(lp); lp.connect(g);
        // Sweep the cutoff for the "whoosh", and swell the gain for gusts.
        const sweep = ctx.createOscillator(); sweep.frequency.value = 0.07;
        const sweepDepth = ctx.createGain(); sweepDepth.gain.value = 350;
        sweep.connect(sweepDepth); sweepDepth.connect(lp.frequency);
        const gust = ctx.createOscillator(); gust.frequency.value = 0.1;
        const gustDepth = ctx.createGain(); gustDepth.gain.value = 0.25;
        gust.connect(gustDepth); gustDepth.connect(g.gain);
        src.start(); sweep.start(); gust.start();
        this.nodes.push(src, sweep, gust);
      }
    }

    // Ramp master toward the current volume — a no-op when already there (a switch),
    // a fade-in from 0 when starting fresh.
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(this.volume, now + 0.4);
  }

  // Begin a file-backed sound: reset the lead copy to the top, silence the other, and let
  // the scheduler drive the crossfade loop from here.
  private playFile(ctx: AudioContext, master: GainNode, id: AmbienceId, url: string): void {
    const voice = this.ensureVoice(ctx, master, id, url);
    this.activeVoice = voice;
    voice.active = 0;
    voice.crossfading = false;
    const now = ctx.currentTime;
    voice.gains[0].gain.cancelScheduledValues(now);
    voice.gains[0].gain.setValueAtTime(1, now);
    voice.gains[1].gain.cancelScheduledValues(now);
    voice.gains[1].gain.setValueAtTime(0, now);
    voice.els[1].pause();
    const lead = voice.els[0];
    lead.currentTime = 0;
    void lead.play().catch(() => { /* transient autoplay/async hiccup — ignore */ });
    this.startScheduler();
  }

  private startScheduler(): void {
    this.stopScheduler();
    this.scheduler = setInterval(() => this.tickCrossfade(), SCHEDULER_MS);
  }

  private stopScheduler(): void {
    if (this.scheduler !== null) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
  }

  // Called on a timer while a file sound plays: once the lead copy is within one crossfade
  // of its end, hand off to the waiting copy.
  private tickCrossfade(): void {
    const voice = this.activeVoice;
    const ctx = this.ctx;
    if (!voice || !ctx || voice.crossfading) return;
    const lead = voice.els[voice.active];
    const dur = lead.duration;
    if (!isFinite(dur) || dur === 0) return; // metadata not loaded yet
    if (dur <= 2 * CROSSFADE_SEC) {
      // Too short to overlap two copies — fall back to the element's own loop.
      lead.loop = true;
      return;
    }
    if (lead.currentTime < dur - CROSSFADE_SEC) return;
    this.beginCrossfade(voice, ctx);
  }

  private beginCrossfade(voice: FileVoice, ctx: AudioContext): void {
    voice.crossfading = true;
    const next = (voice.active ^ 1) as 0 | 1;
    const nextEl = voice.els[next];
    nextEl.currentTime = 0;
    void nextEl.play().catch(() => { /* ignore */ });

    const t = ctx.currentTime;
    const outgoing = voice.gains[voice.active].gain;
    const incoming = voice.gains[next].gain;
    outgoing.cancelScheduledValues(t);
    outgoing.setValueCurveAtTime(FADE_OUT_CURVE, t, CROSSFADE_SEC);
    incoming.cancelScheduledValues(t);
    incoming.setValueCurveAtTime(FADE_IN_CURVE, t, CROSSFADE_SEC);

    const finished = voice.els[voice.active];
    voice.active = next;
    // Pause the copy we faded out once it's silent, and reopen the gate for the next loop.
    setTimeout(() => {
      finished.pause();
      voice.crossfading = false;
    }, CROSSFADE_SEC * 1000 + 60);
  }

  // Stop every file voice: halt the scheduler and pause both copies of each. Only one is
  // ever active, and play() restarts whichever it needs, so pausing them all is correct.
  private stopVoices(): void {
    this.stopScheduler();
    this.activeVoice = null;
    this.voices.forEach(v => {
      v.els[0].pause();
      v.els[1].pause();
      v.crossfading = false;
    });
  }

  /** Fade out and stop everything. Safe to call when nothing is playing. */
  stop(): void {
    this.current = null;
    this.stopScheduler(); // no new loop crossfades once we're fading out
    if (!this.ctx || !this.master) { this.stopVoices(); return; }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.3);
    const toStop = this.nodes;
    this.nodes = [];
    // Let the fade finish before killing the sources so it doesn't click. The file voices
    // keep playing (audibly) under the master fade, then get paused once it's silent.
    setTimeout(() => {
      toStop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
      if (this.current === null) this.stopVoices();
    }, 350);
  }

  private stopNodes(): void {
    this.nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.nodes = [];
    this.stopVoices();
  }

  /** 0..1. Applies immediately while playing; remembered for the next play otherwise. */
  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master && this.current) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(this.volume, now + 0.1);
    }
  }
}

export const ambienceEngine = new AmbienceEngine();
