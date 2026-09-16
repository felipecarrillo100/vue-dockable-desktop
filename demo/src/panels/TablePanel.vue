<script setup lang="ts">
/** A data table, for demonstrating a panel whose content scrolls independently. */
const rows = Array.from({ length: 60 }, (_, i) => ({
  id: 1000 + i,
  name: ['Substation', 'Feeder', 'Transformer', 'Switchgear'][i % 4] + ' ' + (i + 1),
  status: (['online', 'degraded', 'offline'] as const)[i % 3],
  load: Math.round(Math.random() * 100),
}))
const colour = (status: string) =>
  status === 'online' ? '#22c55e' : status === 'degraded' ? '#f59e0b' : '#ef4444'
</script>

<template>
  <div class="dd-panel">
    <table style="width: 100%; border-collapse: collapse; font-size: 0.75rem">
      <thead>
        <tr style="text-align: start; opacity: 0.55">
          <th style="padding: 0.25rem 0.4rem">ID</th>
          <th style="padding: 0.25rem 0.4rem">Asset</th>
          <th style="padding: 0.25rem 0.4rem">Status</th>
          <th style="padding: 0.25rem 0.4rem; text-align: end">Load</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id" style="border-top: 1px solid rgba(255,255,255,0.06)">
          <td style="padding: 0.25rem 0.4rem; font-family: ui-monospace, monospace">{{ row.id }}</td>
          <td style="padding: 0.25rem 0.4rem">{{ row.name }}</td>
          <td style="padding: 0.25rem 0.4rem">
            <span class="dd-row">
              <span class="dd-swatch" :style="{ background: colour(row.status) }" />
              {{ row.status }}
            </span>
          </td>
          <td style="padding: 0.25rem 0.4rem; text-align: end; font-family: ui-monospace, monospace">{{ row.load }}%</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
