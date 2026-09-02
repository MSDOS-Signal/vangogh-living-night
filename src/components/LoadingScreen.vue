<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../state/store'

const pct = computed(() => Math.round(store.loadingProgress * 100))
</script>

<template>
  <div class="loading">
    <div class="core">
      <h1 class="title">VAN GOGH</h1>
      <div class="subtitle">THE LIVING NIGHT</div>
      <div class="spacer" />
      <div class="label">{{ store.loadingLabel }}</div>
      <div class="bar">
        <div class="bar-fill" :style="{ width: pct + '%' }" />
      </div>
      <div class="pct">{{ pct }}%</div>
    </div>
  </div>
</template>

<style scoped>
.loading {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.core {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: min(420px, 78vw);
}

.title {
  font-size: clamp(34px, 6vw, 58px);
  font-weight: 200;
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  color: rgba(235, 240, 255, 0.96);
  line-height: 1;
}

.subtitle {
  margin-top: 16px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.62em;
  text-indent: 0.62em;
  color: rgba(200, 210, 235, 0.5);
}

.spacer {
  height: clamp(48px, 9vh, 84px);
}

.label {
  font-size: 9.5px;
  letter-spacing: 0.34em;
  color: rgba(160, 185, 255, 0.55);
  margin-bottom: 14px;
  text-transform: uppercase;
}

.bar {
  width: 100%;
  height: 1px;
  background: rgba(160, 185, 255, 0.14);
  position: relative;
  overflow: hidden;
}

.bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, rgba(140, 175, 255, 0.5), rgba(255, 220, 160, 0.85));
  box-shadow: 0 0 12px rgba(140, 175, 255, 0.55);
  transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.pct {
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  color: rgba(200, 210, 235, 0.4);
}
</style>
