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

export function createTray(cb: TrayCallbacks): Tray {
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

  const menu = (): Menu =>
    Menu.buildFromTemplate([
      { label: '显示 / 隐藏悬浮窗', click: cb.onToggleWidget },
      { label: '点击穿透', type: 'checkbox', checked: cb.clickThroughEnabled(), click: cb.onToggleClickThrough },
      { type: 'separator' },
      { label: '立即刷新', click: cb.onRefresh },
      { label: '打开设置', click: cb.onOpenSettings },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  tray.setContextMenu(menu())
  tray.on('click', cb.onToggleWidget)
  return tray
}
