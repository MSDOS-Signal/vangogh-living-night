import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { GestureName } from '../state/store'

export interface Vec2 {
  x: number
  y: number
}

export interface HandAnalysis {
  gesture: GestureName
  /** palm center in raw video space (x right, y DOWN, 0..1) */
  palm: Vec2
  indexTip: Vec2
  thumbTip: Vec2
  wrist: Vec2
  /** thumb-tip ↔ index-tip distance, normalized by palm size */
  pinchDistance: number
  /** wrist ↔ middle-MCP distance, normalized frame units */
  palmSize: number
  fingers: [boolean, boolean, boolean, boolean, boolean] // thumb, index, middle, ring, pinky
}

export interface FrameAnalysis {
  hands: HandAnalysis[]
  /** stable gesture of the dominant (first) hand, hysteresis-filtered */
  gesture: GestureName
  /** rising-edge gesture — set only on the frame the gesture changes */
  gestureChanged: GestureName | null
  /** distance between two palm centers (null when < 2 hands) */
  twoHandDistance: number | null
  /** d(twoHandDistance)/dt in units/s — positive = spreading apart */
  spreadVelocity: number | null
  /** rising-edge swipe event */
  swipe: 'LEFT' | 'RIGHT' | null
  /** palm center velocity (units/s) of the dominant hand */
  palmVelocity: Vec2
}

const dist = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Classifies 21-point hand landmarks into gestures and derives
 * temporal signals (palm velocity, swipes, two-hand spread).
 */
export class GestureRecognizer {
  private stableGesture: GestureName = 'NONE'
  private candidate: GestureName = 'NONE'
  private candidateFrames = 0
  private palmHistory: { x: number; y: number; t: number }[] = []
  private lastSwipeAt = 0
  private swipeCooldownMs = 700
  private lastTwoHandDist: number | null = null
  private lastTwoHandTime = 0

  /** Required consecutive frames before a gesture switch commits. */
  static readonly STABILITY_FRAMES = 3

  analyze(landmarkSets: NormalizedLandmark[][]): FrameAnalysis {
    const hands: HandAnalysis[] = landmarkSets
      .filter((lms) => lms.length === 21)
      .map((lms) => this.analyzeHand(lms))

    // ---- dominant-hand gesture with hysteresis ----
    const raw = hands[0]?.gesture ?? 'NONE'
    if (raw === this.candidate) {
      this.candidateFrames++
    } else {
      this.candidate = raw
      this.candidateFrames = 1
    }
    let gestureChanged: GestureName | null = null
    if (this.candidateFrames >= GestureRecognizer.STABILITY_FRAMES && this.candidate !== this.stableGesture) {
      this.stableGesture = this.candidate
      gestureChanged = this.candidate
    }

    // ---- palm velocity + swipe detection ----
    const now = performance.now()
    let palmVelocity = { x: 0, y: 0 }
    let swipe: 'LEFT' | 'RIGHT' | null = null
    if (hands[0]) {
      this.palmHistory.push({ x: hands[0].palm.x, y: hands[0].palm.y, t: now })
      // keep ~200 ms window
      while (this.palmHistory.length > 2 && now - this.palmHistory[0].t > 200) {
        this.palmHistory.shift()
      }
      const first = this.palmHistory[0]
      const dt = Math.max((now - first.t) / 1000, 0.03)
      palmVelocity = { x: (hands[0].palm.x - first.x) / dt, y: (hands[0].palm.y - first.y) / dt }

      if (
        Math.abs(palmVelocity.x) > 1.15 &&
        Math.abs(palmVelocity.x) > Math.abs(palmVelocity.y) * 1.6 &&
        now - this.lastSwipeAt > this.swipeCooldownMs &&
        (this.stableGesture === 'OPEN_PALM' || this.stableGesture === 'POINT')
      ) {
        this.lastSwipeAt = now
        swipe = palmVelocity.x > 0 ? 'RIGHT' : 'LEFT'
      }
    } else {
      this.palmHistory = []
    }

    // ---- two-hand metrics ----
    let twoHandDistance: number | null = null
    let spreadVelocity: number | null = null
    if (hands.length >= 2) {
      twoHandDistance = Math.hypot(hands[0].palm.x - hands[1].palm.x, hands[0].palm.y - hands[1].palm.y)
      if (this.lastTwoHandDist !== null && now - this.lastTwoHandTime < 250) {
        spreadVelocity = (twoHandDistance - this.lastTwoHandDist) / Math.max((now - this.lastTwoHandTime) / 1000, 0.03)
      }
      this.lastTwoHandDist = twoHandDistance
      this.lastTwoHandTime = now
    } else {
      this.lastTwoHandDist = null
    }

    return {
      hands,
      gesture: this.stableGesture,
      gestureChanged,
      twoHandDistance,
      spreadVelocity,
      swipe,
      palmVelocity,
    }
  }

  private analyzeHand(lm: NormalizedLandmark[]): HandAnalysis {
    const wrist = lm[0]
    const thumbTip = lm[4]
    const indexTip = lm[8]
    const middleTip = lm[12]
    const ringTip = lm[16]
    const pinkyTip = lm[20]
    const indexPip = lm[6]
    const middlePip = lm[10]
    const ringPip = lm[14]
    const pinkyPip = lm[18]
    const indexMcp = lm[5]
    const middleMcp = lm[9]

    const palmSize = Math.max(dist(wrist, middleMcp), 0.001)
    const palm: Vec2 = {
      x: (wrist.x + indexMcp.x + middleMcp.x + lm[13].x + lm[17].x) / 5,
      y: (wrist.y + indexMcp.y + middleMcp.y + lm[13].y + lm[17].y) / 5,
    }

    // a finger is extended when its tip is clearly farther from the wrist
    // than its PIP joint (orientation independent)
    const ext = (tip: NormalizedLandmark, pip: NormalizedLandmark) =>
      dist(tip, wrist) > dist(pip, wrist) * 1.12
    const fIndex = ext(indexTip, indexPip)
    const fMiddle = ext(middleTip, middlePip)
    const fRing = ext(ringTip, ringPip)
    const fPinky = ext(pinkyTip, pinkyPip)
    const fThumb = dist(thumbTip, indexMcp) > palmSize * 0.62

    const pinchDistance = dist(thumbTip, indexTip) / palmSize

    let gesture: GestureName = 'NONE'
    if (pinchDistance < 0.42 && (fMiddle || fRing)) {
      gesture = 'PINCH'
    } else if (fThumb && !fIndex && !fMiddle && !fRing && !fPinky && thumbTip.y < wrist.y - palmSize * 0.35) {
      gesture = 'THUMBS_UP'
    } else if (fIndex && !fMiddle && !fRing && !fPinky) {
      gesture = 'POINT'
    } else if (fIndex && fMiddle && !fRing && !fPinky) {
      gesture = 'VICTORY'
    } else if (fIndex && fMiddle && fRing && fPinky && fThumb) {
      gesture = 'OPEN_PALM'
    } else if (!fIndex && !fMiddle && !fRing && !fPinky && !fThumb) {
      gesture = 'FIST'
    }

    return {
      gesture,
      palm,
      indexTip: { x: indexTip.x, y: indexTip.y },
      thumbTip: { x: thumbTip.x, y: thumbTip.y },
      wrist: { x: wrist.x, y: wrist.y },
      pinchDistance,
      palmSize,
      fingers: [fThumb, fIndex, fMiddle, fRing, fPinky],
    }
  }

  reset() {
    this.stableGesture = 'NONE'
    this.candidate = 'NONE'
    this.candidateFrames = 0
    this.palmHistory = []
    this.lastTwoHandDist = null
  }
}
