<script setup lang="ts">
import { ref } from 'vue'
import { exportBackupFile, importBackupBuffer } from '@/utils/backup'
import { downloadBlob, readFileWithProgress } from '@/utils/file'

const emit = defineEmits<{ close: []; imported: [] }>()

const busy = ref(false)
const message = ref('')
const error = ref('')
const progress = ref(0)
const fileInput = ref<HTMLInputElement>()

async function onExport(): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    const { blob, filename } = await exportBackupFile()
    downloadBlob(blob, filename)
    message.value = `已导出 ${filename}（书籍、章节、分组与阅读统计）`
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function onImportFile(file: File): Promise<void> {
  busy.value = true
  error.value = ''
  message.value = ''
  progress.value = 0
  try {
    const buffer = await readFileWithProgress(file, (r) => (progress.value = r))
    const { imported, skipped } = await importBackupBuffer(buffer)
    message.value = `导入完成：新增 ${imported} 本，跳过 ${skipped} 本（同 ID 已存在）`
    emit('imported')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
    progress.value = 0
  }
}

function onPick(): void {
  fileInput.value?.click()
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal">
      <h2 class="modal-title">数据备份</h2>
      <p class="backup-desc">
        导出会将全部书籍、章节、分组与阅读统计保存为一个文件；导入采用合并方式，不会覆盖已有书籍。
      </p>

      <div class="backup-actions">
        <button class="btn btn-primary" :disabled="busy" @click="onExport">⇩ 导出备份</button>
        <button class="btn" :disabled="busy" @click="onPick">⇧ 导入备份</button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,.gz,.json.gz,application/json,application/gzip"
          hidden
          @change="(e) => {
            const f = (e.target as HTMLInputElement).files?.[0]
            if (f) onImportFile(f)
            ;(e.target as HTMLInputElement).value = ''
          }"
        />
      </div>

      <div v-if="busy" class="import-bar"><i :style="{ width: Math.max(2, progress * 100) + '%' }" /></div>
      <p v-if="busy" class="backup-tip">{{ progress >= 1 ? '解析中…' : `读取中… ${Math.round(progress * 100)}%` }}</p>
      <p v-if="message" class="backup-msg">{{ message }}</p>
      <p v-if="error" class="backup-error">{{ error }}</p>

      <div class="modal-actions">
        <button class="btn" :disabled="busy" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-title {
  margin: 0 0 12px;
  font-size: 18px;
}
.backup-desc {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--fg-weak);
}
.backup-actions {
  display: flex;
  gap: 12px;
}
.import-bar {
  margin-top: 14px;
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
.backup-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--fg-weak);
}
.backup-msg {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--accent);
}
.backup-error {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--danger);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>
