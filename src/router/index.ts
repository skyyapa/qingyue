import { createRouter, createWebHashHistory } from 'vue-router'

// 使用 hash 路由：任何静态托管（GitHub Pages 等）刷新深链接都不会 404
// 视图按路由懒加载（动态 import）：书架为唯一首屏目标，阅读器/书源导入按需加载，
// 大幅降低首屏 JS 体积与启动耗时（reader 逻辑 50KB+ 不进主 chunk）。
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'bookshelf', component: () => import('@/views/BookshelfView.vue') },
    { path: '/reader/:id', name: 'reader', component: () => import('@/views/ReaderView.vue') },
    // 书源分享链接：#/source-import/<base64url>
    { path: '/source-import/:payload', name: 'source-import', component: () => import('@/views/SourceImportView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
