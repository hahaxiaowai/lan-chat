import { createApp } from 'vue'
import App from './App.vue'
import { i18n, initializeLocale } from './i18n'
import { initializeTheme } from './composables/useTheme'
import './style.css'

initializeTheme()
initializeLocale()

createApp(App).use(i18n).mount('#app')
