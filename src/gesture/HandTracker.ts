import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

/**
 * Hard deadline for downloading the WASM runtime + hand model. Both assets are
 * fetched from public CDNs; on networks where they are slow or blocked the
 * fetch can stall indefinitely, which would freeze the boot screen just short
 * of 100%. Bounding the load lets the app fall back to AUTO MODE instead.
 */
const MODEL_LOAD_TIMEOUT_MS = 15_000

/** Reject with a readable error if `promise` does not settle within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${what} timed out after ${ms / 1000}s (network/CDN unreachable?)`)),
      ms,
    )
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export type FrameCallback = (hands: NormalizedLandmark[][]) => void

/**
 * Wraps MediaPipe HandLandmarker + webcam.
 * Every failure path (no camera, denied permission, CDN blocked,
 * WebGL unavailable) is reported through the returned promise so the
 * app can silently fall back to AUTO MODE — never a hard error.
 */
export class HandTracker {
  private landmarker: HandLandmarker | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private running = false
  private rafId = 0
  private lastVideoTime = -1
  private lastTimestampMs = -1
  private onFrame: FrameCallback | null = null
  private detectErrors = 0

  /** Load WASM runtime + hand model. Rejects with a human-readable reason. */
  async loadModel(): Promise<void> {
    if (this.landmarker) return
    await withTimeout(
      this.loadModelUnbounded(),
      MODEL_LOAD_TIMEOUT_MS,
      'MediaPipe hand model download',
    )
  }

  private async loadModelUnbounded(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }

  /** getUserMedia + attach to a (typically hidden) video element. */
  async startCamera(video: HTMLVideoElement): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API unavailable (need HTTPS or localhost)')
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    })
    video.srcObject = this.stream
    video.playsInline = true
    video.muted = true
    await video.play()
    this.video = video
  }

  /** Begin the detection loop. */
  start(onFrame: FrameCallback) {
    if (!this.landmarker || !this.video) return
    this.onFrame = onFrame
    this.running = true
    const loop = () => {
      if (!this.running) return
      this.rafId = requestAnimationFrame(loop)
      this.detectOnce()
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private detectOnce() {
    const video = this.video
    const landmarker = this.landmarker
    if (!video || !landmarker || !this.onFrame) return
    if (video.readyState < 2 || video.videoWidth === 0) return
    if (video.currentTime === this.lastVideoTime) return // no new frame yet
    this.lastVideoTime = video.currentTime

    const now = performance.now()
    if (now <= this.lastTimestampMs) return // MediaPipe needs monotonic ts
    this.lastTimestampMs = now

    try {
      const result = landmarker.detectForVideo(video, now)
      this.detectErrors = 0
      this.onFrame(result.landmarks ?? [])
    } catch {
      // tab throttling / context loss — tolerate, bail after repeated failures
      if (++this.detectErrors > 120) this.stop()
    }
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
    this.onFrame = null
  }

  /** Release the webcam (LED off) but keep the loaded model. */
  stopCamera() {
    this.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
    }
    this.lastVideoTime = -1
  }

  dispose() {
    this.stop()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) this.video.srcObject = null
    this.video = null
    this.landmarker?.close()
    this.landmarker = null
  }
}
