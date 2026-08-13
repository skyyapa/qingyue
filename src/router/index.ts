import { createRouter, createWebHashHistory } from 'vue-router'
import BookshelfView from '@/views/BookshelfView.vue'
import ReaderView from '@/views/ReaderView.vue'
import SourceImportView from '@/views/SourceImportView.vue'

// 使用 hash 路由：任何静态托管（GitHub Pages 等）刷新深链接都不会 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'bookshelf', component: BookshelfView },
    { path: '/reader/:id', name: 'reader', component: ReaderView },
    // 书源分享链接：#/source-import/<base64url>
    { path: '/source-import/:payload', name: 'source-import', component: SourceImportView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
