<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { store, QUALITY_PRESETS } from './state/store'
import { HandTracker } from './gesture/HandTracker'
import { GestureRecognizer } from './gesture/GestureRecognizer'
import StarryScene from './components/StarryScene.vue'
import GestureCamera from './components/GestureCamera.vue'
import GestureIndicator from './components/GestureIndicator.vue'
import ControlPanel from './components/ControlPanel.vue'
import LoadingScreen from './components/LoadingScreen.vue'

const tracker = new HandTracker()
const recognizer = new GestureRecognizer()
const camRef = ref<InstanceType<typeof GestureCamera> | null>(null)

provide('handTracker', tracker)
provide('recognizer', recognizer)
provide('getCameraCtl', () => camRef.value)

let mpSettled = false
let idleTimer = 0
let hintTimer = 0

function tryReady() {
  if (store.phase !== 'LOADING') return
  if (store.loadingProgress >= 0.9) {
    if (mpSettled) {
      store.loadingProgress = 1
      store.loadingLabel = 'THE NIGHT IS ALIVE'
      window.setTimeout(() => {
        if (store.phase === 'LOADING') store.phase = 'READY'
      }, 700)
    } else {
      // Scene is rendered but the hand model is still downloading — keep the
      // bar at ~90% and make it obvious we're still working, not stuck.
      store.loadingLabel = 'DOWNLOADING HAND MODEL...'
    }
  }
}

function wake() {
  store.ui.visible = true
  window.clearTimeout(idleTimer)
  idleTimer = window.setTimeout(() => {
    if (!store.hand.detected && !store.ui.panelOpen) store.ui.visible = false
  }, 3800)
}

const trackingLabel = computed(() => {
  switch (store.camera.state) {
    case 'ON': return store.hand.detected ? 'LIVE · HAND LOCKED' : 'LIVE · SEARCHING'
    case 'REQUESTING': return 'REQUESTING'
    case 'DENIED': return 'DENIED'
    case 'ERROR': return 'UNAVAILABLE'
    case 'UNSUPPORTED': return 'UNSUPPORTED'
    default: return store.camera.mediapipeReady ? 'STANDBY' : 'LOADING MODEL'
  }
})

const qualityLabel = computed(() => QUALITY_PRESETS[store.perf.quality].label)

onMounted(() => {
  // MediaPipe loads in the background — failure silently means AUTO MODE
  tracker
    .loadModel()
    .then(() => {
      store.camera.mediapipeReady = true
      store.loadingLabel = 'HAND MODEL READY'
    })
    .catch((err) => {
      store.camera.mediapipeError = String(err?.message ?? err)
      store.camera.state = 'UNSUPPORTED'
      store.params.autoMode = true
    })
    .finally(() => {
      mpSettled = true
      tryReady()
    })

  window.addEventListener('mousemove', wake)
  window.addEventListener('touchstart', wake)
  wake()
})

watch(() => store.loadingProgress, tryReady)

// READY → show the invitation
watch(
  () => store.phase,
  (phase) => {
    if (phase === 'READY') {
      const noCam = store.camera.state === 'UNSUPPORTED' || store.camera.state === 'DENIED'
      store.ui.hintText = noCam ? 'AUTO MODE · THE SKY BREATHES ALONE' : 'RAISE YOUR HAND'
      store.ui.showHint = true
      window.clearTimeout(hintTimer)
      hintTimer = window.setTimeout(() => (store.ui.showHint = false), 9000)
      wake()
    }
  },
)

// first hand → immersive
watch(
  () => store.hand.detected,
  (detected) => {
    if (detected) {
      store.ui.showHint = false
      if (store.phase === 'READY') store.phase = 'IMMERSIVE'
      wake()
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', wake)
  window.removeEventListener('touchstart', wake)
  window.clearTimeout(idleTimer)
  window.clearTimeout(hintTimer)
  tracker.dispose()
})
</script>

<template>
  <div class="app">
    <!-- WebGL experience -->
    <StarryScene />

    <!-- gesture capture -->
    <GestureCamera ref="camRef" />

    <!-- chrome: everything fades with attention -->
    <Transition name="fade-slow">
      <div v-show="store.ui.visible && store.phase !== 'LOADING'" class="chrome">
        <!-- top-left title -->
        <header class="title-block">
          <div class="title">VAN GOGH</div>
          <div class="subtitle">THE LIVING NIGHT</div>
        </header>

        <!-- bottom-left status -->
        <footer class="status glass">
          <div class="srow">
            <span class="hud-label">FPS</span>
            <span class="hud-value" :class="{ 'hud-value--accent': store.perf.fps >= 55 }">
              {{ store.perf.fps }}
            </span>
          </div>
          <div class="srow">
            <span class="hud-label">Render</span>
            <span class="hud-value">{{ qualityLabel }}</span>
          </div>
          <div class="srow">
            <span class="hud-label">Hand Tracking</span>
            <span class="hud-value" :class="{ 'hud-value--gold': store.camera.state === 'ON' }">
              {{ trackingLabel }}
            </span>
          </div>
          <div v-if="store.params.autoMode" class="auto-badge">AUTO MODE</div>
        </footer>

        <!-- bottom-right dock -->
        <ControlPanel />
      </div>
    </Transition>

    <!-- hand HUD -->
    <GestureIndicator />

    <!-- invitation hint -->
    <Transition name="fade-slow">
      <div v-if="store.ui.showHint" class="hint">
        <span class="hint-text">{{ store.ui.hintText }}</span>
        <span class="hint-sub" v-if="store.camera.state === 'ON'">
          POINT to steer the vortex · OPEN PALM to awaken the sky
        </span>
      </div>
    </Transition>

    <!-- boot -->
    <Transition name="fade-slow">
      <LoadingScreen v-if="store.phase === 'LOADING'" />
    </Transition>
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  background: #000;
}

.chrome {
  position: absolute;
  inset: 0;
  z-index: 30;
  pointer-events: none;
}

.chrome :deep(.dock) {
  pointer-events: none;
}

/* ---------- title ---------- */
.title-block {
  position: absolute;
  top: 30px;
  left: 34px;
}

.title {
  font-size: 20px;
  font-weight: 200;
  letter-spacing: 0.52em;
  color: rgba(235, 240, 255, 0.82);
  text-shadow: 0 0 24px rgba(120, 150, 255, 0.25);
}

.subtitle {
  margin-top: 7px;
  font-size: 8.5px;
  font-weight: 400;
  letter-spacing: 0.58em;
  color: rgba(200, 210, 235, 0.42);
}

/* ---------- status ---------- */
.status {
  position: absolute;
  left: 28px;
  bottom: 24px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 210px;
}

.srow {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: baseline;
}

.auto-badge {
  margin-top: 4px;
  text-align: center;
  font-size: 8px;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(140, 175, 255, 0.8);
  border: 1px solid rgba(140, 175, 255, 0.22);
  border-radius: 6px;
  padding: 4px 0;
}

/* ---------- hint ---------- */
.hint {
  position: absolute;
  left: 50%;
  bottom: 14vh;
  transform: translateX(-50%);
  z-index: 35;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  pointer-events: none;
}

.hint-text {
  font-size: 13px;
  font-weight: 300;
  letter-spacing: 0.62em;
  text-indent: 0.62em;
  color: rgba(235, 240, 255, 0.88);
  text-shadow: 0 0 30px rgba(140, 175, 255, 0.5);
  animation: hint-breathe 3.4s ease-in-out infinite;
}

.hint-sub {
  font-size: 8.5px;
  letter-spacing: 0.3em;
  color: rgba(200, 210, 235, 0.4);
}

@keyframes hint-breathe {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@media (max-width: 640px) {
  .title-block { top: 16px; left: 16px; }
  .status { left: 14px; bottom: 14px; min-width: 180px; }
  .hint { bottom: 20vh; }
}
</style>
