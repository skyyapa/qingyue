<script setup lang="ts">
import { computed } from 'vue'
import type { Entity, Relation } from '@/types'

const props = defineProps<{
  entities: Entity[]
  relations: Relation[]
}>()
const emit = defineEmits<{ select: [entityId: string] }>()

const MAX_NODES = 12
const MAX_EDGES = 30

interface Node {
  id: string
  name: string
  count: number
  x: number
  y: number
  r: number
}

interface Edge {
  a: string
  b: string
  weight: number
  width: number
}

const VIEW = 420
const CENTER = VIEW / 2
const RADIUS = 150

const nodes = computed<Node[]>(() => {
  const graph = props.entities.filter((e) => e.type === 'person' || e.type === 'org')
  const sorted = [...graph].sort((a, b) => b.count - a.count).slice(0, MAX_NODES)
  const maxCount = Math.max(1, ...sorted.map((e) => e.count))
  return sorted.map((e, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(1, sorted.length) - Math.PI / 2
    return {
      id: e.id,
      name: e.name,
      count: e.count,
      x: CENTER + RADIUS * Math.cos(angle),
      y: CENTER + RADIUS * Math.sin(angle),
      r: 12 + 10 * (e.count / maxCount),
    }
  })
})

const nodeMap = computed(() => new Map(nodes.value.map((n) => [n.id, n])))

const edges = computed<Edge[]>(() => {
  const map = nodeMap.value
  const filtered = props.relations.filter((r) => map.has(r.a) && map.has(r.b))
  const sorted = [...filtered].sort((a, b) => b.weight - a.weight).slice(0, MAX_EDGES)
  const maxWeight = Math.max(1, ...sorted.map((r) => r.weight))
  return sorted.map((r) => ({ a: r.a, b: r.b, weight: r.weight, width: 0.8 + 2.6 * (r.weight / maxWeight) }))
})

function nodeOf(id: string): Node | undefined {
  return nodeMap.value.get(id)
}
</script>

<template>
  <svg class="graph" :viewBox="`0 0 ${VIEW} ${VIEW}`" role="img" aria-label="人物关系图">
    <line
      v-for="(e, i) in edges"
      :key="i"
      class="graph-edge"
      :x1="nodeOf(e.a)?.x"
      :y1="nodeOf(e.a)?.y"
      :x2="nodeOf(e.b)?.x"
      :y2="nodeOf(e.b)?.y"
      :stroke-width="e.width"
    />
    <g v-for="n in nodes" :key="n.id" class="graph-node" @click="emit('select', n.id)">
      <circle :cx="n.x" :cy="n.y" :r="n.r" />
      <text :x="n.x" :y="n.y" text-anchor="middle" dominant-baseline="central" class="graph-node-char">
        {{ n.name[0] }}
      </text>
      <text :x="n.x" :y="n.y + n.r + 14" text-anchor="middle" class="graph-node-name">{{ n.name }}</text>
    </g>
  </svg>
</template>

<style scoped>
.graph {
  width: 100%;
  height: auto;
  display: block;
}
.graph-edge {
  stroke: var(--accent);
  stroke-opacity: 0.28;
}
.graph-node {
  cursor: pointer;
}
.graph-node circle {
  fill: var(--accent-weak);
  stroke: var(--accent);
  stroke-width: 1.5;
  transition: fill 0.15s;
}
.graph-node:hover circle {
  fill: var(--accent);
}
.graph-node-char {
  font-size: 13px;
  font-weight: 600;
  fill: var(--accent);
  pointer-events: none;
}
.graph-node:hover .graph-node-char {
  fill: #fff;
}
.graph-node-name {
  font-size: 11px;
  fill: var(--fg);
  pointer-events: none;
}
</style>
