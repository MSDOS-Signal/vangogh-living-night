import { reactive, readonly, shallowRef } from 'vue'
import type { SceneManager } from '../three/SceneManager'
import type { GestureMapper } from '../gesture/GestureMapper'

/**
 * Module-level service registries — StarryScene publishes, siblings read.
 * (shallowRef: we never need deep reactivity on engine objects)
 */
export const sceneManagerRef = shallowRef<SceneManager | null>(null)
export const gestureMapperRef = shallowRef<GestureMapper | null>(null)

export type Quality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA'

export type GestureName =
  | 'NONE'
  | 'OPEN_PALM'
  | 'FIST'
  | 'POINT'
  | 'PINCH'
  | 'VICTORY'
  | 'THUMBS_UP'
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'

export type CameraState = 'OFF' | 'REQUESTING' | 'ON' | 'DENIED' | 'ERROR' | 'UNSUPPORTED'

export type AppPhase = 'LOADING' | 'READY' | 'IMMERSIVE'

export interface Vec2 {
  x: number
  y: number
}

/**
 * Single source of truth shared by the gesture layer, the WebGL scene and the UI.
 * Values here are already smoothed — components read, the mapper writes.
 */
export interface SceneParams {
  /** Vortex center in UV space (0..1, y up from bottom of screen) */
  vortexCenter: Vec2
  /** 0..2 — how violently the sky swirls */
  vortexStrength: number
  /** 0.05..0.8 — falloff radius of the vortex */
  vortexRadius: number
  /** -1..1 — swirl direction */
  vortexDirection: number
  /** 0..1 — global flow energy of clouds / noise */
  flow: number
  /** 0.6..2.0 — sky zoom (pinch / two-hand distance) */
  scale: number
  /** 0..1 — master activation of the procedural sky */
  skyActive: number
  /** Freeze animation time */
  paused: boolean
  /** 0..3 palette index (VICTORY cycles it) */
  artMode: number
  /** Autonomous drift mode (no gesture control) */
  autoMode: boolean
  /** 0..1 one-shot burst energy, decays */
  supernova: number
  /** Subtle camera parallax target, -1..1 */
  parallax: Vec2
  /** Global time multiplier */
  timeScale: number
}

export interface HandInfo {
  detected: boolean
  count: number
  gesture: GestureName
  /** smoothed palm center in mirrored video UV (0..1) */
  palm: Vec2 | null
  /** smoothed index fingertip in mirrored video UV */
  indexTip: Vec2 | null
  /** raw pinch distance 0..0.3 */
  pinchDistance: number
}

export interface Store {
  phase: AppPhase
  loadingProgress: number
  loadingLabel: string
  params: SceneParams
  hand: HandInfo
  camera: {
    state: CameraState
    mediapipeReady: boolean
    mediapipeError: string | null
  }
  ui: {
    visible: boolean
    showHint: boolean
    hintText: string
    panelOpen: boolean
    cameraPreviewOpen: boolean
  }
  perf: {
    fps: number
    quality: Quality
    autoQuality: boolean
    starCount: number
    gpuTier: string
  }
  events: {
    /** increments to signal a one-shot supernova */
    supernovaNonce: number
    /** increments to signal art mode change */
    artModeNonce: number
    lastSwipe: { dir: 'LEFT' | 'RIGHT'; nonce: number } | null
  }
}

export const store = reactive<Store>({
  phase: 'LOADING',
  loadingProgress: 0,
  loadingLabel: 'INITIALIZING NIGHT SKY...',
  params: {
    vortexCenter: { x: 0.5, y: 0.55 },
    vortexStrength: 0.55,
    vortexRadius: 0.34,
    vortexDirection: 1,
    flow: 0.5,
    scale: 1,
    skyActive: 0,
    paused: false,
    artMode: 0,
    autoMode: true,
    supernova: 0,
    parallax: { x: 0, y: 0 },
    timeScale: 1,
  },
  hand: {
    detected: false,
    count: 0,
    gesture: 'NONE',
    palm: null,
    indexTip: null,
    pinchDistance: 0,
  },
  camera: {
    state: 'OFF',
    mediapipeReady: false,
    mediapipeError: null,
  },
  ui: {
    visible: false,
    showHint: false,
    hintText: 'RAISE YOUR HAND',
    panelOpen: false,
    cameraPreviewOpen: false,
  },
  perf: {
    fps: 0,
    quality: 'HIGH',
    autoQuality: true,
    starCount: 8000,
    gpuTier: 'detecting',
  },
  events: {
    supernovaNonce: 0,
    artModeNonce: 0,
    lastSwipe: null,
  },
})

export const storeRO = readonly(store)

export const QUALITY_PRESETS: Record<
  Quality,
  { stars: number; pixelRatioCap: number; octaves: number; bloom: boolean; label: string }
> = {
  LOW: { stars: 3000, pixelRatioCap: 1, octaves: 3, bloom: false, label: 'LOW QUALITY' },
  MEDIUM: { stars: 5000, pixelRatioCap: 1.5, octaves: 4, bloom: true, label: 'MEDIUM QUALITY' },
  HIGH: { stars: 8000, pixelRatioCap: 2, octaves: 5, bloom: true, label: 'HIGH QUALITY' },
  ULTRA: { stars: 10000, pixelRatioCap: 2, octaves: 6, bloom: true, label: 'ULTRA QUALITY' },
}

export const ART_MODE_NAMES = ['CLASSIC', 'AZURE', 'EMBER', 'NOIR'] as const
