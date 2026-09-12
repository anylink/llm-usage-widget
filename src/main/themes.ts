/* 主题清单:内置四套 + 用户 themes/*.css 热加载(设计 §9.3)
   用户主题约定:CSS 内用 body[data-theme='文件名'] 选择器覆盖变量 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ThemePayload } from '@shared/types'

export type { ThemePayload }

export const BUILTIN_THEMES = ['dark', 'light', 'glass', 'pixel']

function themesDir(): string {
  return path.join(app.getPath('userData'), 'themes')
}

export function themesPayload(): ThemePayload {
  let user: { id: string; css: string }[] = []
  try {
    user = fs
      .readdirSync(themesDir())
      .filter((f) => f.endsWith('.css'))
      .map((f) => ({ id: f.slice(0, -4), css: fs.readFileSync(path.join(themesDir(), f), 'utf-8') }))
  } catch {
    user = []
  }
  return { builtin: BUILTIN_THEMES, user }
}

/** 监听用户主题目录,防抖回调(文件改动 → 界面热更新) */
export function watchThemes(onChange: () => void): void {
  const dir = themesDir()
  fs.mkdirSync(dir, { recursive: true })
  try {
    let timer: NodeJS.Timeout | undefined
    fs.watch(dir, () => {
      clearTimeout(timer)
      timer = setTimeout(onChange, 500)
    })
  } catch {
    // 监听失败不致命
  }
}
