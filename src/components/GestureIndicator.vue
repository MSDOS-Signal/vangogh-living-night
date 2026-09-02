<script setup lang="ts">
import { computed } from 'vue'
import { store, ART_MODE_NAMES } from '../state/store'

const visible = computed(() => store.hand.detected && store.phase !== 'LOADING')

const vortexPct = computed(() =>
  Math.round((store.params.vortexStrength / 2) * 100),
)
const flowPct = computed(() => Math.round(store.params.flow * 100))
const scaleVal = computed(() => store.params.scale.toFixed(2))
const gesture = computed(() => store.hand.gesture.replace('_', ' '))
const artMode = computed(() => ART_MODE_NAMES[store.params.artMode])
</script>

<template>
  <Transition name="fade-slow">
    <div v-if="visible" class="indicator glass">
      <div class="row head">
        <span class="dot" :class="{ live: store.hand.detected }" />
        <span class="hud-label">Hand Detected</span>
        <span class="hud-value hud-value--accent count">×{{ store.hand.count }}</span>
      </div>

      <div class="hairline" />

      <div class="row">
        <span class="hud-label">Gesture</span>
        <span class="hud-value hud-value--gold">{{ gesture }}</span>
      </div>
      <div class="row">
        <span class="hud-label">Vortex</span>
        <span class="hud-value">{{ vortexPct }}%</span>
      </div>
      <div class="row">
        <span class="hud-label">Flow</span>
        <span class="hud-value">{{ flowPct }}%</span>
      </div>
      <div class="row">
        <span class="hud-label">Scale</span>
        <span class="hud-value">{{ scaleVal }}×</span>
      </div>
      <div class="row">
        <span class="hud-label">Palette</span>
        <span class="hud-value">{{ artMode }}</span>
      </div>

      <div v-if="store.params.paused" class="paused">TIME SUSPENDED</div>
      <div v-if="store.params.supernova > 0.02" class="supernova">SUPERNOVA</div>
    </div>
  </Transition>
</template>

<style scoped>
.indicator {
  position: fixed;
  top: 28px;
  right: 28px;
  z-index: 40;
  width: 218px;
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  pointer-events: none;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.row.head {
  margin-bottom: 2px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(140, 175, 255, 0.9);
  box-shadow: 0 0 8px rgba(140, 175, 255, 0.9);
  margin-right: 8px;
  animation: breathe 2.4s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

.count {
  margin-left: auto;
}

.hairline {
  margin: 4px 0 6px;
}

.paused,
.supernova {
  margin-top: 6px;
  text-align: center;
  font-size: 9px;
  letter-spacing: 0.4em;
  padding: 5px 0;
  border: 1px solid rgba(160, 185, 255, 0.18);
  border-radius: 6px;
}

.paused {
  color: rgba(200, 210, 235, 0.75);
}

.supernova {
  color: rgba(255, 214, 140, 0.95);
  border-color: rgba(255, 214, 140, 0.35);
  box-shadow: 0 0 18px rgba(255, 200, 120, 0.18) inset;
  animation: flash 0.9s ease-in-out infinite;
}

@keyframes flash {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@media (max-width: 640px) {
  .indicator {
    top: 14px;
    right: 14px;
    width: 180px;
    padding: 10px 12px;
  }
}
</style>
