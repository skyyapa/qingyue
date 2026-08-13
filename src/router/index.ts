import { createRouter, createWebHashHistory } from 'vue-router'
import BookshelfView from '@/views/BookshelfView.vue'
import ReaderView from '@/views/ReaderView.vue'

// 使用 hash 路由：任何静态托管（GitHub Pages 等）刷新深链接都不会 404
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'bookshelf', component: BookshelfView },
    { path: '/reader/:id', name: 'reader', component: ReaderView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
