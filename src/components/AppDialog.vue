<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/** 应用内对话框：支持确认文案 / 危险操作 / 输入框三种形态，替代原生 confirm / prompt
 *  键盘支持：Esc 取消（等同 cancel）、输入框内 Enter 确认 */
defineProps<{
  title: string
  message?: string
  /** 显示输入框（输入框模式下 message 作为 placeholder） */
  input?: boolean
  confirmText?: string
  danger?: boolean
}>()
const emit = defineEmits<{ confirm: [value: string]; cancel: [] }>()

/** 输入框内容（不能用 `input` 命名，否则与 prop 同名遮蔽导致模板取错） */
const inputValue = ref('')
const inputEl = ref<HTMLInputElement>()
const confirmEl = ref<HTMLButtonElement>()

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  // 初始焦点放入对话框：输入框优先聚焦，否则聚焦确认按钮（无障碍/键盘）
  if (inputEl.value) inputEl.value.focus()
  else confirmEl.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="mask" @click.self="emit('cancel')">
    <div class="modal app-dialog" role="dialog" aria-modal="true" :aria-label="title">
      <h2 class="dialog-title">{{ title }}</h2>
      <p v-if="message" class="dialog-msg">{{ message }}</p>
      <input
        v-if="input"
        ref="inputEl"
        v-model="inputValue"
        class="dialog-input"
        type="text"
        :placeholder="message"
        @keyup.enter="emit('confirm', inputValue)"
      />
      <div class="modal-actions">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button
          ref="confirmEl"
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          @click="emit('confirm', inputValue)"
        >
          {{ confirmText ?? '确定' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-dialog {
  width: min(92vw, 380px);
}
.dialog-title {
  margin: 0 0 12px;
  font-size: 17px;
}
.dialog-msg {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--fg);
  word-break: break-all;
}
.dialog-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s;
}
.dialog-input:focus {
  border-color: var(--accent);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
