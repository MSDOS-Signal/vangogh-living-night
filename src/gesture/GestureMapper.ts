import { store, ART_MODE_NAMES } from '../state/store'
import type { VortexEffect } from '../three/VortexEffect'
import type { FrameAnalysis } from './GestureRecognizer'

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Translates recognized gestures into scene targets.
 * All screen coordinates are MIRRORED (selfie view): x → 1 - x.
 * The VortexEffect damps everything downstream, so writes here can be direct.
 */
export class GestureMapper {
  private twoHandRefDist: number | null = null
  private lastSupernovaAt = 0
  private lastArtModeAt = 0
  private handLostSince: number | null = null
  /** seconds of grace before control returns to AUTO MODE */
  private static readonly HAND_LOST_GRACE = 0.9

  constructor(private vortex: VortexEffect) {}

  update(frame: FrameAnalysis | null) {
    const p = store.params
    const h = store.hand
    const now = performance.now() / 1000
    const t = this.vortex.target

    // ---------- no hand ----------
    if (!frame || frame.hands.length === 0) {
      if (this.handLostSince === null) this.handLostSince = now
      h.count = 0
      h.pinchDistance = 0
      if (now - this.handLostSince > GestureMapper.HAND_LOST_GRACE) {
        if (h.detected || h.gesture !== 'NONE') {
          h.detected = false
          h.gesture = 'NONE'
          h.palm = null
          h.indexTip = null
        }
        if (!p.autoMode) {
          p.autoMode = true
          p.paused = false
          this.vortex.relaxToAuto()
        }
        this.twoHandRefDist = null
      }
      return
    }
    this.handLostSince = null

    // ---------- hand present ----------
    const hand = frame.hands[0]
    const mirrorX = (x: number) => 1 - x
    const toUvY = (y: number) => 1 - y // landmark y-down → uv y-up

    const palmScreen = { x: mirrorX(hand.palm.x), y: toUvY(hand.palm.y) }
    const indexScreen = { x: mirrorX(hand.indexTip.x), y: toUvY(hand.indexTip.y) }

    h.detected = true
    h.count = frame.hands.length
    h.gesture = frame.gesture
    h.palm = palmScreen
    h.indexTip = indexScreen
    h.pinchDistance = hand.pinchDistance

    // leaving AUTO MODE: an intentional gesture takes control
    if (p.autoMode && (frame.gesture === 'POINT' || frame.gesture === 'OPEN_PALM')) {
      p.autoMode = false
      this.twoHandRefDist = null
    }

    // THUMBS_UP → surrender control back to AUTO MODE
    if (frame.gestureChanged === 'THUMBS_UP') {
      p.autoMode = true
      p.paused = false
      t.timeScale = 1
      this.vortex.relaxToAuto()
      this.twoHandRefDist = null
      return
    }

    // VICTORY → cycle art mode (edge-triggered, with cooldown)
    if (frame.gestureChanged === 'VICTORY' && now - this.lastArtModeAt > 0.8) {
      this.lastArtModeAt = now
      p.artMode = (p.artMode + 1) % ART_MODE_NAMES.length
      store.events.artModeNonce++
    }

    // SWIPE → directional pulse (mirror: video-left = screen-right)
    if (frame.swipe) {
      const screenDir = frame.swipe === 'LEFT' ? 1 : -1
      this.vortex.pulse(screenDir)
      store.events.lastSwipe = { dir: frame.swipe, nonce: (store.events.lastSwipe?.nonce ?? 0) + 1 }
    }

    // TWO HANDS → distance zoom + spread supernova
    if (frame.twoHandDistance !== null) {
      const d = frame.twoHandDistance
      if (this.twoHandRefDist === null) this.twoHandRefDist = d
      // slow leak so held poses don't lock the zoom forever
      this.twoHandRefDist = lerp(this.twoHandRefDist, d, 0.004)
      t.scale = clamp(d / Math.max(this.twoHandRefDist, 0.05), 0.7, 1.8)

      if (
        frame.spreadVelocity !== null &&
        frame.spreadVelocity > 0.9 &&
        d > 0.28 &&
        now - this.lastSupernovaAt > 4
      ) {
        this.lastSupernovaAt = now
        store.events.supernovaNonce++
        this.vortex.triggerSupernova()
      }
    } else {
      this.twoHandRefDist = null
    }

    if (p.autoMode) return // drift owns the targets

    // ---------- per-gesture continuous control ----------
    const vx = -frame.palmVelocity.x // mirrored horizontal palm velocity

    switch (frame.gesture) {
      case 'POINT': {
        // index fingertip steers the vortex center
        t.center.set(clamp(indexScreen.x, 0.05, 0.95), clamp(indexScreen.y, 0.12, 0.95))
        // palm height drives intensity — higher hand, fiercer sky
        t.strength = clamp(0.35 + palmScreen.y * 1.05, 0.3, 1.7)
        // horizontal palm movement steers swirl direction (dead zone)
        if (Math.abs(vx) > 0.18) t.direction = clamp(vx * 1.4, -1, 1)
        t.flow = clamp(0.4 + t.strength * 0.3, 0.2, 0.9)
        t.skyActive = 1
        t.scale = lerp(t.scale, 1, 0.08)
        t.timeScale = 1
        p.paused = false
        break
      }
      case 'OPEN_PALM': {
        // activate the sky — violent flow, center eases toward the palm
        t.skyActive = 1
        t.flow = 0.95
        t.strength = 1.15
        t.center.set(
          lerp(t.center.x, clamp(palmScreen.x, 0.05, 0.95), 0.12),
          lerp(t.center.y, clamp(palmScreen.y, 0.12, 0.95), 0.12),
        )
        if (Math.abs(vx) > 0.18) t.direction = clamp(vx * 1.4, -1, 1)
        t.timeScale = 1
        p.paused = false
        break
      }
      case 'PINCH': {
        // thumb↔index distance: tighter pinch → sky comes closer
        const pd = hand.pinchDistance
        t.scale = clamp(1.0 + (0.46 - pd) * 2.7, 0.85, 1.95)
        t.skyActive = 1
        t.flow = clamp(t.flow, 0.35, 0.9)
        t.timeScale = 1
        p.paused = false
        break
      }
      case 'FIST': {
        // freeze the night
        t.timeScale = 0
        p.paused = true
        break
      }
      case 'VICTORY': {
        t.skyActive = 1
        t.timeScale = 1
        p.paused = false
        break
      }
      default: {
        // transitional pose — ease back toward calm
        t.strength = lerp(t.strength, 0.55, 0.04)
        t.flow = lerp(t.flow, 0.45, 0.04)
        t.scale = lerp(t.scale, 1, 0.05)
        t.timeScale = 1
        p.paused = false
        break
      }
    }

    // subtle parallax follows the palm
    t.parallax.set((palmScreen.x - 0.5) * 1.4, (palmScreen.y - 0.5) * 0.9)
  }

  /** UI-triggered supernova (control panel / keyboard). */
  triggerSupernova() {
    store.events.supernovaNonce++
    this.vortex.triggerSupernova()
  }
}
