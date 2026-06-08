// Optional sound — ONE sonic identity (a single timbre family) with TWO tuned voices:
// a soft printer "whir" during the feed, and a gentle two-note completion "ding".
// Synthesized via WebAudio (no asset files). Mute is the SINGLE source of truth
// (persisted, default MUTED) and is NOT gated on prefers-reduced-motion.

const MUTE_KEY = 're-muted'
let muted = ((): boolean => {
  try {
    // default muted: anything other than an explicit '0' means muted
    return localStorage.getItem(MUTE_KEY) !== '0'
  } catch {
    return true
  }
})()

export function isMuted(): boolean {
  return muted
}
export function setMuted(v: boolean): void {
  muted = v
  try {
    localStorage.setItem(MUTE_KEY, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

let ctx: AudioContext | null = null
function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Resume the audio context on a user gesture (browser autoplay policy). Safe to call often. */
export function primeAudio(): void {
  ac()
}

function blip(c: AudioContext, freq: number, t0: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  o.connect(g)
  g.connect(c.destination)
  o.start(t0)
  o.stop(t0 + dur + 0.02)
}

/** Soft printer whir during the feed — one wavering, band-passed tone (NOT staccato clicks). */
export function playWhir(durSec = 1): void {
  if (muted) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime
  const o = c.createOscillator()
  const g = c.createGain()
  const f = c.createBiquadFilter()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(58, t0)
  // a gentle wobble gives it a motor feel
  const lfo = c.createOscillator()
  const lfoG = c.createGain()
  lfo.frequency.setValueAtTime(11, t0)
  lfoG.gain.setValueAtTime(6, t0)
  lfo.connect(lfoG)
  lfoG.connect(o.frequency)
  f.type = 'bandpass'
  f.frequency.setValueAtTime(440, t0)
  f.Q.setValueAtTime(0.8, t0)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(0.05, t0 + 0.08)
  g.gain.setValueAtTime(0.05, t0 + Math.max(0.2, durSec - 0.15))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec)
  o.connect(f)
  f.connect(g)
  g.connect(c.destination)
  o.start(t0)
  o.stop(t0 + durSec + 0.05)
  lfo.start(t0)
  lfo.stop(t0 + durSec + 0.05)
}

/** Gentle two-note completion ding ("sale complete"). */
export function playDing(): void {
  if (muted) return
  const c = ac()
  if (!c) return
  const t0 = c.currentTime
  blip(c, 880, t0, 0.18, 0.12) // A5
  blip(c, 1318.5, t0 + 0.09, 0.3, 0.1) // E6 — a bright, pleasant fifth above
}
