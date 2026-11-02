/**
 * Tiny procedural audio engine.
 *
 * The whole soundtrack and every effect is synthesised at runtime, so the game
 * ships with no binary audio and starts instantly. One AudioContext is created
 * lazily on the first gesture (browser autoplay rules) and every sound is a
 * short oscillator / filtered-noise envelope.
 */

type Ctx = AudioContext

class AudioEngine {
  private ctx: Ctx | null = null
  private master: GainNode | null = null
  private ambientTimer: number | null = null
  private ambientTheme = 'meadow'
  soundEnabled = true
  ambienceEnabled = true

  private ensure(): Ctx | null {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!this.ctx) {
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.55
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** Call from a pointer/key handler so mobile browsers allow sound. */
  unlock(): void {
    this.ensure()
  }

  setSound(enabled: boolean): void {
    this.soundEnabled = enabled
    if (this.master) this.master.gain.value = enabled ? 0.55 : 0
  }

  setAmbience(enabled: boolean): void {
    this.ambienceEnabled = enabled
    if (enabled) this.startAmbience(this.ambientTheme)
    else this.stopAmbience()
  }

  private tone(
    freq: number,
    {
      type = 'sine' as OscillatorType,
      dur = 0.18,
      gain = 0.12,
      delay = 0,
      slide = 0,
      attack = 0.008,
    } = {},
  ): void {
    if (!this.soundEnabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(Math.max(20, freq), t)
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur)
    amp.gain.setValueAtTime(0.0001, t)
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(amp).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  private noise({ dur = 0.3, gain = 0.16, freq = 800, delay = 0, sweep = 0.4 } = {}): void {
    if (!this.soundEnabled) return
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime + delay
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      const fade = (1 - i / length) ** 2
      data[i] = (Math.random() * 2 - 1) * fade
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(Math.max(80, freq * 3), t)
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * sweep), t + dur)
    const amp = ctx.createGain()
    amp.gain.value = gain
    src.connect(filter).connect(amp).connect(this.master)
    src.start(t)
  }

  putt(power: number): void {
    const p = Math.max(0.15, Math.min(1, power))
    this.noise({ dur: 0.1, gain: 0.1 + p * 0.12, freq: 420 + p * 260, sweep: 0.5 })
    this.tone(150 + p * 90, { type: 'triangle', dur: 0.12, gain: 0.1 + p * 0.05, slide: 0.6 })
  }

  bounce(strength: number): void {
    const s = Math.min(1, strength / 700)
    this.tone(190 + s * 220, { type: 'square', dur: 0.06 + s * 0.05, gain: 0.02 + s * 0.05, slide: 0.7 })
    this.noise({ dur: 0.05, gain: 0.02 + s * 0.05, freq: 500 })
  }

  bumper(): void {
    this.tone(520, { type: 'triangle', dur: 0.16, gain: 0.1, slide: 1.9 })
    this.tone(260, { type: 'sine', dur: 0.22, gain: 0.08, slide: 0.9 })
  }

  splash(): void {
    this.noise({ dur: 0.5, gain: 0.2, freq: 900, sweep: 0.15 })
    this.tone(320, { type: 'sine', dur: 0.3, gain: 0.06, slide: 0.4 })
  }

  sink(): void {
    this.tone(700, { type: 'sine', dur: 0.09, gain: 0.09 })
    this.tone(520, { type: 'sine', dur: 0.12, gain: 0.09, delay: 0.07 })
    this.tone(360, { type: 'sine', dur: 0.2, gain: 0.1, delay: 0.14 })
    this.noise({ dur: 0.18, gain: 0.06, freq: 700, delay: 0.02 })
  }

  birdie(): void {
    ;[0, 4, 7, 12].forEach((semi, i) => {
      this.tone(523.25 * 2 ** (semi / 12), { type: 'triangle', dur: 0.32, gain: 0.07, delay: i * 0.09 })
    })
  }

  bird(): void {
    const base = 1300 + Math.random() * 900
    this.tone(base, { type: 'sine', dur: 0.07, gain: 0.025, slide: 1.5 })
    this.tone(base * 1.2, { type: 'sine', dur: 0.06, gain: 0.02, delay: 0.08, slide: 0.8 })
  }

  chime(): void {
    ;[0, 7, 12, 19].forEach((semi, i) => {
      this.tone(440 * 2 ** (semi / 12), { type: 'sine', dur: 0.5, gain: 0.06, delay: i * 0.1 })
    })
  }

  click(): void {
    this.tone(680, { type: 'triangle', dur: 0.05, gain: 0.05 })
  }

  fanfare(): void {
    this.chime()
  }

  fail(): void {
    this.tone(300, { type: 'triangle', dur: 0.18, gain: 0.06, slide: 0.8 })
    this.tone(220, { type: 'triangle', dur: 0.26, gain: 0.05, delay: 0.1, slide: 0.75 })
  }

  startAmbience(theme: string): void {
    this.ambientTheme = theme
    if (!this.ambienceEnabled) return
    if (this.ambientTimer !== null) return
    this.ambientTimer = window.setInterval(() => {
      if (!this.ambienceEnabled || !this.soundEnabled) return
      if (document.visibilityState === 'hidden') return
      if (Math.random() < 0.55) this.bird()
    }, 3800)
  }

  stopAmbience(): void {
    if (this.ambientTimer !== null) {
      window.clearInterval(this.ambientTimer)
      this.ambientTimer = null
    }
  }
}

export const audio = new AudioEngine()
