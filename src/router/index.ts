import { createRouter, createWebHistory } from 'vue-router'
import BookshelfView from '@/views/BookshelfView.vue'
import ReaderView from '@/views/ReaderView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'bookshelf', component: BookshelfView },
    { path: '/reader/:id', name: 'reader', component: ReaderView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
