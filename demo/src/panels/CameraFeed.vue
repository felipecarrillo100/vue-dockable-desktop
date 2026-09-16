<script setup lang="ts">
/** A mock camera feed. Its animation keeps running through every dock and float. */
const props = defineProps<{ name: string; colour: string }>()
</script>

<template>
  <div class="dd-camera" :style="{ background: `linear-gradient(160deg, ${props.colour}22, #0c0f14)` }">
    <div class="dd-camera__sweep" />
    <div class="dd-camera__label" :style="{ color: props.colour }">● REC · {{ props.name }}</div>
    <svg viewBox="0 0 100 70" style="width: 100%; height: 100%; opacity: 0.5">
      <g :stroke="props.colour" stroke-width="0.4" fill="none" opacity="0.5">
        <path v-for="i in 7" :key="i" :d="`M0 ${i * 10}H100`" />
      </g>
      <circle cx="50" cy="35" r="9" :fill="props.colour" opacity="0.3" />
      <circle cx="50" cy="35" r="3.5" :fill="props.colour" />
    </svg>
  </div>
</template>
