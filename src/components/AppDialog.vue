<script setup lang="ts">
import { ref } from 'vue'

/** 应用内对话框：支持确认文案 / 危险操作 / 输入框三种形态，替代原生 confirm / prompt */
const props = defineProps<{
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
</script>

<template>
  <div class="mask" @click.self="emit('cancel')">
    <div class="modal app-dialog">
      <h2 class="dialog-title">{{ title }}</h2>
      <p v-if="message" class="dialog-msg">{{ message }}</p>
      <input
        v-if="input"
        v-model="inputValue"
        class="dialog-input"
        type="text"
        :placeholder="message"
        @keyup.enter="emit('confirm', inputValue)"
      />
      <div class="modal-actions">
        <button class="btn" @click="emit('cancel')">取消</button>
        <button
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
