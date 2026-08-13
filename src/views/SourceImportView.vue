<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { decodeSourcePayload, importSources } from '@/book-source/store'
import type { BookSource } from '@/book-source/types'

const route = useRoute()
const router = useRouter()

const sources = ref<BookSource[]>([])
const error = ref('')
const overwrite = ref(false)
const importing = ref(false)
const result = ref('')

onMounted(() => {
  const payload = String(route.params.payload ?? '')
  if (!payload) {
    error.value = '分享链接缺少书源数据'
    return
  }
  try {
    sources.value = decodeSourcePayload(payload)
  } catch (e) {
    error.value = `书源解析失败：${e instanceof Error ? e.message : String(e)}`
  }
})

async function onImport(): Promise<void> {
  if (sources.value.length === 0) return
  importing.value = true
  result.value = ''
  try {
    const r = importSources(JSON.stringify(sources.value), { overwrite: overwrite.value })
    result.value =
      `导入完成：新增 ${r.added} 个，覆盖 ${r.updated} 个，跳过 ${r.skipped} 个`
  } catch (e) {
    error.value = `导入失败：${e instanceof Error ? e.message : String(e)}`
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="import-page">
    <div class="card">
      <h1 class="title">导入分享的书源</h1>

      <p v-if="error" class="error">{{ error }}</p>

      <template v-else>
        <ul class="source-list">
          <li v-for="s in sources" :key="s.id" class="source-item">
            <span class="name">{{ s.name }}</span>
            <span class="id">{{ s.id }}</span>
          </li>
        </ul>

        <label class="overwrite">
          <input v-model="overwrite" type="checkbox" />
          <span>已存在同 ID 书源时覆盖更新</span>
        </label>

        <p v-if="result" class="result">{{ result }}</p>

        <div class="actions">
          <button class="btn btn-primary" :disabled="importing" @click="onImport">
            {{ importing ? '导入中…' : '导入书源' }}
          </button>
          <button class="btn" @click="router.push('/')">返回书架</button>
        </div>
      </template>

      <div v-if="error" class="actions">
        <button class="btn" @click="router.push('/')">返回书架</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}
.card {
  width: min(94vw, 440px);
  padding: 24px;
  border-radius: 12px;
  background: var(--panel);
  border: 1px solid var(--panel-border);
}
.title {
  margin: 0 0 16px;
  font-size: 18px;
}
.source-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.source-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  font-size: 14px;
}
.source-item .name {
  font-weight: 600;
}
.source-item .id {
  font-size: 11px;
  color: var(--fg-weak);
}
.overwrite {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  margin-bottom: 12px;
  cursor: pointer;
}
.result {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--accent);
}
.error {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--danger);
}
.actions {
  display: flex;
  gap: 8px;
}
</style>
