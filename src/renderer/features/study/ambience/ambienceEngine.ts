import { type AmbienceId, fillPinkNoise, fillBrownNoise } from '../../../../shared/ambience';
import rainUrl from '../../../assets/ambience/rain.mp3';
import beachUrl from '../../../assets/ambience/beach.mp3';

// Sounds backed by a bundled recording rather than synthesis. To add another, drop
// the loop in assets/ambience/, add its id to AmbienceId + AMBIENCE_SOUNDS, and map
// it here — the engine handles the rest.
const FILE_SOUNDS: Partial<Record<AmbienceId, string>> = {
  rain: rainUrl,
  beach: beachUrl,
};

// Imperative Web Audio engine for Focus Mode ambience. One AudioContext, created
// lazily on first play (browsers only allow audio to start from a user gesture — a
// chip click qualifies). Each sound is a small graph feeding a master gain we ramp
// for click-free fades: Wind/Brown are synthesized looping noise buffers; Rain/Beach
// are bundled mp3s played through <audio> elements (a media element loads file:// in
// a packaged build, where fetch()+decodeAudioData would not).
//
// State is deliberately module-level (a singleton): there's only ever one room, and
// keeping the AudioContext out of React means re-renders can't tear down playback.
class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Live sources + LFOs for the current sound, stopped on switch/stop. */
  private nodes: AudioScheduledSourceNode[] = [];
  private current: AmbienceId | null = null;
  private volume = 0.6;
  // File-backed sounds play from a bundled mp3. Each element + its source node are
  // created once (createMediaElementSource may only be called once per element) and
  // reused, keyed by sound id; we pause/restart the element rather than stopping a node.
  private media = new Map<AmbienceId, { el: HTMLAudioElement; source: MediaElementAudioSourceNode }>();

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

  // Get (or lazily build) the looping <audio> element + its Web Audio source for a
  // file-backed sound. Built once per id and reused, since createMediaElementSource
  // throws if called twice on the same element.
  private ensureMedia(ctx: AudioContext, id: AmbienceId, url: string): { el: HTMLAudioElement; source: MediaElementAudioSourceNode } {
    let entry = this.media.get(id);
    if (!entry) {
      const el = new Audio(url);
      el.loop = true;
      const source = ctx.createMediaElementSource(el);
      entry = { el, source };
      this.media.set(id, entry);
    }
    return entry;
  }

  // Pause every file-backed element. Only one is ever active, and the current play()
  // restarts whichever it needs, so pausing them all is the simple, correct move.
  private pauseMedia(): void {
    this.media.forEach(({ el }) => el.pause());
  }

  /** Start (or switch to) a sound. Switching noise→noise under a steady master gain
   *  is inaudibly smooth, so we don't dip the volume between sounds. */
  play(id: AmbienceId): void {
    const { ctx, master } = this.ensure();
    this.stopNodes();
    this.current = id;

    // A per-sound gain lets LFOs modulate amplitude without touching master (volume).
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(master);

    const fileUrl = FILE_SOUNDS[id];
    if (fileUrl) {
      // A real recording already sounds the part — just route it into master.
      const { el, source } = this.ensureMedia(ctx, id, fileUrl);
      source.disconnect();
      source.connect(g);
      el.currentTime = 0;
      void el.play().catch(() => { /* transient autoplay/async hiccup — ignore */ });
    } else if (id === 'brown') {
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

    // Ramp master toward the current volume — a no-op when already there (a switch),
    // a fade-in from 0 when starting fresh.
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(this.volume, now + 0.4);
  }

  /** Fade out and stop everything. Safe to call when nothing is playing. */
  stop(): void {
    this.current = null;
    if (!this.ctx || !this.master) { this.pauseMedia(); return; }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 0.3);
    const toStop = this.nodes;
    this.nodes = [];
    // Let the fade finish before killing the sources so it doesn't click. The media
    // fades with the master gain; pause it only if nothing new started meanwhile.
    setTimeout(() => {
      toStop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
      if (this.current === null) this.pauseMedia();
    }, 350);
  }

  private stopNodes(): void {
    this.nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
    this.nodes = [];
    this.pauseMedia();
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
