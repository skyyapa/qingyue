<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useBooksStore } from '@/stores/books'
import type { TextEncoding } from '@/types'

const emit = defineEmits<{ close: []; imported: [id: string | null] }>()
const props = defineProps<{ initialFiles?: File[] }>()
const books = useBooksStore()

const encoding = ref<TextEncoding>('auto')
const fileInput = ref<HTMLInputElement>()

const encodingLabel: Record<TextEncoding, string> = {
  auto: '自动检测',
  'utf-8': 'UTF-8',
  gb18030: 'GB18030（兼容 GBK）',
  big5: 'Big5（繁体）',
  'utf-16': 'UTF-16',
}
const encodings = Object.keys(encodingLabel) as TextEncoding[]

function pickFiles(): void {
  fileInput.value?.click()
}

async function handleFiles(files: FileList | File[] | null): Promise<void> {
  if (!files || files.length === 0) return
  if (books.importing) return // 已有导入进行中：拒绝并发，避免进度交错/写库竞态
  const meta = await books.importFiles(files, encoding.value)
  emit('imported', meta?.id ?? null)
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  handleFiles(e.dataTransfer?.files ?? null)
}

// 原生「用轻阅打开」的文件：对话框挂载后自动导入
onMounted(() => {
  if (props.initialFiles?.length) void handleFiles(props.initialFiles)
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal">
      <h2 class="modal-title">导入书籍</h2>

      <div class="drop-zone" @dragover.prevent @drop="onDrop" @click="pickFiles">
        <p class="drop-icon">📂</p>
        <p class="drop-text">点击选择文件，或将 TXT / EPUB / 单书文件拖到这里</p>
        <p class="drop-sub">支持多选；中文文本编码自动检测；.qingyue 为导出的单书文件</p>
        <input
          ref="fileInput"
          type="file"
          accept=".txt,.epub,.qingyue,.json,text/plain,application/epub+zip,application/json"
          multiple
          hidden
          @change="(e) => handleFiles((e.target as HTMLInputElement).files)"
        />
      </div>

      <div class="encoding-row">
        <span>TXT 编码</span>
        <select v-model="encoding">
          <option v-for="e in encodings" :key="e" :value="e">{{ encodingLabel[e] }}</option>
        </select>
      </div>

      <p v-if="books.importing" class="import-tip">
        正在导入「{{ books.importFileName }}」…
        <template v-if="books.importProgress < 1">（{{ Math.round(books.importProgress * 100) }}%）</template>
        <template v-else>（解析中…）</template>
      </p>
      <div v-if="books.importing" class="import-bar">
        <i :style="{ width: Math.max(2, books.importProgress * 100) + '%' }" />
      </div>
      <p v-if="books.importError" class="import-error">{{ books.importError }}</p>

      <div class="modal-actions">
        <button class="btn" :disabled="books.importing" @click="emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-title {
  margin: 0 0 16px;
  font-size: 18px;
}
.drop-zone {
  border: 2px dashed var(--panel-border);
  border-radius: 12px;
  padding: 34px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
}
.drop-zone:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.drop-icon {
  font-size: 36px;
  margin: 0 0 8px;
}
.drop-text {
  margin: 0 0 6px;
  font-size: 14px;
}
.drop-sub {
  margin: 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.encoding-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  font-size: 14px;
}
.encoding-row select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
}
.import-tip {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--fg-weak);
}
.import-bar {
  margin-top: 8px;
  height: 5px;
  border-radius: 3px;
  background: var(--panel-border);
  overflow: hidden;
}
.import-bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.15s ease;
}
.import-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--danger);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
