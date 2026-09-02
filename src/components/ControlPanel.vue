<script setup lang="ts">
import { computed, inject, watch } from 'vue'
import {
  store,
  sceneManagerRef,
  gestureMapperRef,
  QUALITY_PRESETS,
  ART_MODE_NAMES,
  type Quality,
} from '../state/store'

const getCameraCtl = inject<() => { enable(): void; disable(): void } | null>('getCameraCtl')!

const sm = () => sceneManagerRef.value

// ---- local slider state, synced when the panel opens ----
const stars = computed({
  get: () => store.perf.starCount,
  set: (v: number) => {
    store.perf.autoQuality = false
    sm()?.setStarCount(v)
  },
})

const strength = computed({
  get: () => Math.round(store.params.vortexStrength * 100),
  set: (v: number) => manual(() => (sm()!.vortex.target.strength = v / 100)),
})

const radius = computed({
  get: () => Math.round(store.params.vortexRadius * 100),
  set: (v: number) => manual(() => (sm()!.vortex.target.radius = v / 100)),
})

const flow = computed({
  get: () => Math.round(store.params.flow * 100),
  set: (v: number) => manual(() => (sm()!.vortex.target.flow = v / 100)),
})

function manual(fn: () => void) {
  if (!sm()) return
  // manual control suspends autonomous drift
  if (store.params.autoMode) store.params.autoMode = false
  fn()
}

function setQuality(q: Quality) {
  store.perf.autoQuality = false
  sm()?.applyQuality(q)
}

function setAutoQuality() {
  store.perf.autoQuality = true
}

function cycleArtMode() {
  store.params.artMode = (store.params.artMode + 1) % ART_MODE_NAMES.length
  store.events.artModeNonce++
}

function supernova() {
  gestureMapperRef.value?.triggerSupernova()
}

function toggleAuto() {
  const p = store.params
  p.autoMode = !p.autoMode
  if (p.autoMode) sm()?.vortex.relaxToAuto()
}

function toggleCamera() {
  const ctl = getCameraCtl()
  if (!ctl) return
  if (store.camera.state === 'ON') ctl.disable()
  else ctl.enable()
}

const cameraLabel = computed(() => {
  switch (store.camera.state) {
    case 'ON': return 'CAMERA · LIVE'
    case 'REQUESTING': return 'CAMERA · …'
    case 'DENIED': return 'CAMERA · DENIED'
    case 'ERROR': return 'CAMERA · ERROR'
    case 'UNSUPPORTED': return 'CAMERA · N/A'
    default: return 'CAMERA · OFF'
  }
})

const qualities: Quality[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']

watch(
  () => store.ui.panelOpen,
  (open) => {
    if (open) {
      // resync sliders to live values
      stars.value = store.perf.starCount
    }
  },
)
</script>

<template>
  <div class="dock">
    <!-- collapsed label -->
    <button class="tab btn-lux" :class="{ active: store.ui.panelOpen }" @click="store.ui.panelOpen = !store.ui.panelOpen">
      Gesture Control
    </button>

    <Transition name="panel">
      <div v-if="store.ui.panelOpen" class="panel glass">
        <div class="row">
          <span class="hud-label">Camera</span>
          <button class="btn-lux sm" @click="toggleCamera">{{ cameraLabel }}</button>
        </div>

        <div class="hairline" />

        <div class="row">
          <span class="hud-label">Quality</span>
          <div class="qbtns">
            <button class="btn-lux xs" :class="{ active: store.perf.autoQuality }" @click="setAutoQuality">Auto</button>
            <button
              v-for="q in qualities"
              :key="q"
              class="btn-lux xs"
              :class="{ active: !store.perf.autoQuality && store.perf.quality === q }"
              @click="setQuality(q)"
            >{{ q }}</button>
          </div>
        </div>

        <div class="slider">
          <div class="srow"><span class="hud-label">Stars</span><span class="hud-value">{{ stars }}</span></div>
          <input v-model.number="stars" class="lux" type="range" min="1000" max="12000" step="500" />
        </div>
        <div class="slider">
          <div class="srow"><span class="hud-label">Vortex</span><span class="hud-value">{{ strength }}%</span></div>
          <input v-model.number="strength" class="lux" type="range" min="0" max="200" step="1" />
        </div>
        <div class="slider">
          <div class="srow"><span class="hud-label">Radius</span><span class="hud-value">{{ radius }}%</span></div>
          <input v-model.number="radius" class="lux" type="range" min="5" max="80" step="1" />
        </div>
        <div class="slider">
          <div class="srow"><span class="hud-label">Flow</span><span class="hud-value">{{ flow }}%</span></div>
          <input v-model.number="flow" class="lux" type="range" min="0" max="100" step="1" />
        </div>

        <div class="hairline" />

        <div class="row">
          <span class="hud-label">Palette</span>
          <button class="btn-lux sm" @click="cycleArtMode">{{ ART_MODE_NAMES[store.params.artMode] }}</button>
        </div>
        <div class="row">
          <span class="hud-label">Mode</span>
          <button class="btn-lux sm" :class="{ active: store.params.autoMode }" @click="toggleAuto">
            {{ store.params.autoMode ? 'Auto Drift' : 'Manual' }}
          </button>
        </div>
        <button class="btn-lux wide" @click="supernova">✦&ensp;Supernova</button>

        <div class="keys hud-label">C panel · S supernova · A auto</div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.dock {
  position: fixed;
  right: 28px;
  bottom: 24px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 12px;
}

.tab {
  pointer-events: auto;
}

.panel {
  width: 280px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  pointer-events: auto;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.qbtns {
  display: flex;
  gap: 4px;
}

.btn-lux.sm {
  padding: 6px 10px;
  font-size: 9px;
  letter-spacing: 0.16em;
}

.btn-lux.xs {
  padding: 5px 7px;
  font-size: 8px;
  letter-spacing: 0.1em;
  border-radius: 7px;
}

.btn-lux.wide {
  width: 100%;
  padding: 9px 0;
  color: var(--gold);
  border-color: rgba(255, 214, 140, 0.25);
}

.btn-lux.wide:hover {
  border-color: rgba(255, 214, 140, 0.55);
  box-shadow: 0 0 20px rgba(255, 200, 120, 0.18);
}

.slider {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.srow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.keys {
  text-align: center;
  font-size: 8px;
  letter-spacing: 0.22em;
  color: var(--ink-faint);
  margin-top: 2px;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.45s var(--ease-lux), transform 0.45s var(--ease-lux);
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}

@media (max-width: 640px) {
  .dock {
    right: 14px;
    bottom: 14px;
  }
  .panel {
    width: min(280px, calc(100vw - 28px));
  }
}
</style>
