<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from 'vue'
import { store, gestureMapperRef } from '../state/store'
import type { HandTracker } from '../gesture/HandTracker'
import type { GestureRecognizer } from '../gesture/GestureRecognizer'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const tracker = inject<HandTracker>('handTracker')!
const recognizer = inject<GestureRecognizer>('recognizer')!

let disposed = false

function onHands(hands: NormalizedLandmark[][]) {
  if (disposed) return
  const frame = recognizer.analyze(hands)
  gestureMapperRef.value?.update(frame)
  drawPreview(hands)
}

function drawPreview(hands: NormalizedLandmark[][]) {
  const cv = canvasRef.value
  const video = videoRef.value
  if (!cv || !video || video.videoWidth === 0) return
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const W = cv.width
  const H = cv.height

  ctx.clearRect(0, 0, W, H)
  // Privacy: the camera feed is never painted — only the hand skeleton is
  // drawn, so the face and surroundings never appear on screen.

  const px = (x: number) => (1 - x) * W // mirrored
  const py = (y: number) => y * H

  for (const lms of hands) {
    if (lms.length !== 21) continue
    // bones
    ctx.lineWidth = 1.2
    ctx.strokeStyle = 'rgba(150, 185, 255, 0.75)'
    ctx.shadowColor = 'rgba(140, 175, 255, 0.8)'
    ctx.shadowBlur = 5
    ctx.beginPath()
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(px(lms[a].x), py(lms[a].y))
      ctx.lineTo(px(lms[b].x), py(lms[b].y))
    }
    ctx.stroke()
    // joints
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(225, 235, 255, 0.92)'
    for (const lm of lms) {
      ctx.beginPath()
      ctx.arc(px(lm.x), py(lm.y), 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    // index fingertip — the vortex conductor
    ctx.fillStyle = 'rgba(255, 214, 140, 0.95)'
    ctx.shadowColor = 'rgba(255, 200, 120, 0.95)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(px(lms[8].x), py(lms[8].y), 3.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // frame hairline
  ctx.strokeStyle = 'rgba(160, 185, 255, 0.16)'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)
}

async function enable() {
  if (!videoRef.value || store.camera.state === 'ON' || store.camera.state === 'REQUESTING') return
  store.camera.state = 'REQUESTING'
  try {
    if (!store.camera.mediapipeReady) await tracker.loadModel()
    store.camera.mediapipeReady = true
    await tracker.startCamera(videoRef.value)
    tracker.start(onHands)
    store.camera.state = 'ON'
    store.ui.cameraPreviewOpen = true
  } catch (err: any) {
    const name = String(err?.name ?? '')
    store.camera.state = name === 'NotAllowedError' || name === 'SecurityError' ? 'DENIED' : 'ERROR'
    store.camera.mediapipeError = String(err?.message ?? err)
    store.params.autoMode = true
  }
}

function disable() {
  tracker.stopCamera()
  recognizer.reset()
  gestureMapperRef.value?.update(null)
  store.camera.state = store.camera.mediapipeReady ? 'OFF' : 'ERROR'
  store.ui.cameraPreviewOpen = false
  store.params.autoMode = true
}

defineExpose({ enable, disable })

// auto-start once the experience is ready and the model is loaded
watch(
  () => [store.phase, store.camera.mediapipeReady, store.camera.state] as const,
  ([phase, ready, state]) => {
    if (phase === 'READY' && ready && state === 'OFF' && !store.camera.mediapipeError) {
      enable()
    }
  },
)

onBeforeUnmount(() => {
  disposed = true
  tracker.stopCamera()
})
</script>

<template>
  <!-- hidden source video -->
  <video ref="videoRef" class="source" playsinline muted />

  <!-- glass preview -->
  <Transition name="fade-slow">
    <div
      v-if="store.ui.cameraPreviewOpen && store.camera.state === 'ON'"
      class="preview glass"
    >
      <canvas ref="canvasRef" width="224" height="168" />
      <div class="tag">
        <span class="dot" />
        <span class="hud-label">Hand Tracking · Skeleton Only</span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.source {
  position: fixed;
  top: 0;
  left: 0;
  width: 2px;
  height: 2px;
  opacity: 0;
  pointer-events: none;
  z-index: -1;
}

.preview {
  position: fixed;
  top: 28px;
  left: 28px;
  z-index: 40;
  padding: 8px;
  border-radius: 14px;
  pointer-events: none;
}

.preview canvas {
  display: block;
  width: 224px;
  height: 168px;
  border-radius: 8px;
}

.tag {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
  padding: 0 2px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 120, 120, 0.9);
  box-shadow: 0 0 8px rgba(255, 120, 120, 0.8);
  animation: blink 2s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

@media (max-width: 640px) {
  .preview {
    top: auto;
    bottom: 96px;
    left: 14px;
  }
  .preview canvas {
    width: 148px;
    height: 111px;
  }
}
</style>
