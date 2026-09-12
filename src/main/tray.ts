/* 托盘:显示/隐藏、点击穿透、立即刷新、设置、退出 */
import { Menu, Tray, app, nativeImage } from 'electron'
import path from 'node:path'
import type { i18n as I18nInstance } from 'i18next'

export interface TrayCallbacks {
  onToggleWidget(): void
  clickThroughEnabled(): boolean
  onToggleClickThrough(): void
  onRefresh(): void
  onOpenSettings(): void
}

export interface TrayHandle {
  tray: Tray
  /** 外部(设置页等)改变点击穿透状态或语言后调用,重建菜单同步勾选与文案 */
  refreshMenu(): void
}

export function createTray(cb: TrayCallbacks, i18n: I18nInstance): TrayHandle {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'icons', 'tray@2x.png') : '',
    path.resolve(__dirname, '../../resources/icons/tray@2x.png')
  ].filter(Boolean)
  let img = nativeImage.createEmpty()
  for (const p of candidates) {
    img = nativeImage.createFromPath(p)
    if (!img.isEmpty()) break
  }
  const tray = new Tray(img)
  tray.setToolTip('LLM Usage Widget')

  // 勾选状态与文案在构建时求值,每次打开前需重建;菜单自身切换后立即重建
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: i18n.t('tray.toggleWidget'), click: cb.onToggleWidget },
      {
        label: i18n.t('tray.clickThrough'),
        type: 'checkbox',
        checked: cb.clickThroughEnabled(),
        click: () => {
          cb.onToggleClickThrough()
          tray.setContextMenu(menu())
        }
      },
      { type: 'separator' },
      { label: i18n.t('tray.refresh'), click: cb.onRefresh },
      { label: i18n.t('tray.settings'), click: cb.onOpenSettings },
      { type: 'separator' },
      { label: i18n.t('tray.quit'), click: () => app.quit() }
    ])
  tray.setContextMenu(menu())
  tray.on('click', cb.onToggleWidget)
  return { tray, refreshMenu: (): void => tray.setContextMenu(menu()) }
}
