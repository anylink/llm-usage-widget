/* 托盘:显示/隐藏、点击穿透、立即刷新、设置、退出 */
import { Menu, Tray, app, nativeImage } from 'electron'
import path from 'node:path'

export interface TrayCallbacks {
  onToggleWidget(): void
  clickThroughEnabled(): boolean
  onToggleClickThrough(): void
  onRefresh(): void
  onOpenSettings(): void
}

export interface TrayHandle {
  tray: Tray
  /** 外部(设置页等)改变点击穿透状态后调用,同步托盘菜单勾选 */
  refreshMenu(): void
}

export function createTray(cb: TrayCallbacks): TrayHandle {
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

  // 勾选状态在构建时求值,每次打开前需重建;菜单自身切换后立即重建
  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏悬浮窗', click: cb.onToggleWidget },
      {
        label: '点击穿透',
        type: 'checkbox',
        checked: cb.clickThroughEnabled(),
        click: () => {
          cb.onToggleClickThrough()
          tray.setContextMenu(menu())
        }
      },
      { type: 'separator' },
      { label: '立即刷新', click: cb.onRefresh },
      { label: '打开设置', click: cb.onOpenSettings },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  tray.setContextMenu(menu())
  tray.on('click', cb.onToggleWidget)
  return { tray, refreshMenu: (): void => tray.setContextMenu(menu()) }
}
