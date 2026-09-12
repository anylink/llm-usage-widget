/* i18n:字典与实例工厂,主进程与两个渲染窗口共用(设计 §14:i18next,zh-CN/en 起步) */
import i18next from 'i18next'
import type { i18n as I18nInstance, Module } from 'i18next'
import zhCN from './locales/zh-CN.json' with { type: 'json' }
import en from './locales/en.json' with { type: 'json' }

/** display.json 里的偏好;auto = 跟随系统 */
export type LocalePref = 'auto' | 'zh-CN' | 'en'
/** 实际生效语言(仅两种) */
export type Locale = 'zh-CN' | 'en'

export const LOCALE_PREFS: LocalePref[] = ['auto', 'zh-CN', 'en']

export function resolveLocale(pref: LocalePref, systemLocale: string): Locale {
  if (pref === 'zh-CN' || pref === 'en') return pref
  return systemLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

/** 创建独立 i18next 实例(资源内联,init 同步完成);渲染窗口传入 initReactI18next */
export function createI18n(lng: Locale, modules: Module[] = []): I18nInstance {
  const i18n = i18next.createInstance()
  for (const m of modules) i18n.use(m)
  void i18n.init({
    lng,
    fallbackLng: 'zh-CN',
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en }
    },
    interpolation: { escapeValue: false }
  })
  return i18n
}
