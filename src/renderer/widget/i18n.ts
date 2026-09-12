/* 悬浮窗 i18n 实例:初始按浏览器语言猜测,DisplayConfig 到达后校正 */
import { initReactI18next } from 'react-i18next'
import { createI18n, resolveLocale } from '@shared/i18n'

export const i18n = createI18n(resolveLocale('auto', navigator.language), [initReactI18next])
