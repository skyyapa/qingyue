<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAIStore } from '@/stores/ai'
import { AI_PRESETS, AI_PRESET_IDS, isProviderReady, type AIProviderPreset } from '@/ai/presets'
import { testProvider } from '@/ai/client'

/** AI Provider 设置：Base URL / API Key / Model / 测试连接 / 启用 */
const emit = defineEmits<{ close: [] }>()
const ai = useAIStore()

const selectedId = ref<AIProviderPreset>('deepseek')
const testing = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)

const selected = computed(() => ai.providers.find((p) => p.id === selectedId.value)!)

function selectProvider(id: AIProviderPreset): void {
  selectedId.value = id
  testResult.value = null
}

async function runTest(): Promise<void> {
  testing.value = true
  testResult.value = null
  try {
    const reply = await testProvider(selected.value)
    testResult.value = { ok: true, text: reply.slice(0, 80) }
  } catch (err) {
    testResult.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    testing.value = false
  }
}

function enableAndClose(): void {
  ai.enable(selectedId.value)
  emit('close')
}
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal ai-modal">
      <header class="ai-head">
        <span>AI Provider</span>
        <button class="btn-ghost" title="关闭" @click="emit('close')">✕</button>
      </header>

      <p class="ai-intro">统一 OpenAI 兼容协议：配置一次，即可对接 DeepSeek / Gemini / 本地 Ollama / LM Studio / 任意兼容服务。</p>

      <div class="provider-list">
        <button
          v-for="id in AI_PRESET_IDS"
          :key="id"
          class="provider-item"
          :class="{ active: selectedId === id }"
          @click="selectProvider(id)"
        >
          <span class="provider-name">{{ AI_PRESETS[id].label }}</span>
          <span class="provider-state" :class="{ on: ai.providers.find((p) => p.id === id)?.enabled }">
            {{ ai.providers.find((p) => p.id === id)?.enabled ? '已启用' : isProviderReady(ai.providers.find((p) => p.id === id)!) ? '已配置' : '未配置' }}
          </span>
        </button>
      </div>

      <div class="provider-form">
        <label class="ai-row">
          <span>Base URL</span>
          <input v-model="selected.baseUrl" type="text" placeholder="https://api.example.com/v1" spellcheck="false" />
        </label>
        <label class="ai-row">
          <span>API Key</span>
          <input
            v-model="selected.apiKey"
            type="password"
            autocomplete="off"
            :placeholder="AI_PRESETS[selected.id].apiKeyRequired ? 'sk-…' : '本地服务可留空'"
          />
        </label>
        <label class="ai-row">
          <span>Model</span>
          <input v-model="selected.model" type="text" spellcheck="false" />
        </label>
        <label class="ai-row">
          <span>简单任务</span>
          <input v-model="selected.easyModel" type="text" placeholder="留空用主模型（who/回顾/伏笔等）" spellcheck="false" />
        </label>
        <label class="ai-row">
          <span>摘要任务</span>
          <input v-model="selected.summaryModel" type="text" placeholder="留空用主模型（章节摘要/今日回顾）" spellcheck="false" />
        </label>
        <p class="ai-hint">{{ AI_PRESETS[selected.id].hint }}</p>
        <p class="ai-hint">💡 多模型策略：简单问答与摘要可用更便宜的模型（如 DeepSeek），复杂剧情分析用主模型（如 GPT），降低成本。</p>

        <div class="ai-actions">
          <button class="btn" :disabled="testing" @click="runTest">
            {{ testing ? '测试中…' : '测试连接' }}
          </button>
          <button class="btn btn-primary" @click="enableAndClose">启用此 Provider</button>
        </div>
        <p v-if="testResult" class="ai-test" :class="testResult.ok ? 'ok' : 'fail'">
          {{ testResult.ok ? `✅ 连接成功：${testResult.text}` : `❌ ${testResult.text}` }}
        </p>
        <p class="ai-note">API Key 仅保存在本机浏览器（localStorage），不会上传到轻阅服务器。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-modal {
  width: min(92vw, 420px);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
}
.ai-intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--fg-weak);
}
.provider-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.provider-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  background: transparent;
  color: var(--fg);
  font-size: 12px;
  cursor: pointer;
}
.provider-item.active {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.provider-state {
  font-size: 10px;
  color: var(--fg-weak);
  background: var(--panel-border);
  border-radius: 8px;
  padding: 1px 6px;
}
.provider-state.on {
  color: #fff;
  background: var(--accent);
}
.provider-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.ai-row span {
  width: 72px;
  flex-shrink: 0;
  color: var(--fg-weak);
}
.ai-row input {
  flex: 1;
  padding: 7px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--fg);
  font-size: 13px;
  outline: none;
}
/* 16px 起：iOS 聚焦输入框时不自动放大页面 */
@media (max-width: 720px) {
  .ai-row input {
    font-size: 16px;
  }
}
.ai-row input:focus {
  border-color: var(--accent);
}
.ai-hint {
  margin: 0;
  font-size: 11px;
  color: var(--fg-weak);
}
.ai-actions {
  display: flex;
  gap: 8px;
}
.ai-test {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}
.ai-test.ok {
  color: var(--accent);
}
.ai-test.fail {
  color: var(--danger);
}
.ai-note {
  margin: 0;
  font-size: 11px;
  color: var(--fg-weak);
}
</style>
