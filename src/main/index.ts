/* 主进程入口:单实例、窗口、托盘、调度器、IPC 组装 */
import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { createPluginRegistry } from './engine/plugins'
import { loadVendors, watchVendors, userVendorsDir } from './engine/loader'
import { Scheduler } from './scheduler'
import { AlertManager } from './alerts'
import {
  ensureDefaultAccounts,
  isEncryptionAvailable,
  loadAccounts,
  loadDisplay,
  nextAccountId,
  saveDisplay,
  upsertAccount
} from './config'
import { WindowManager } from './windows'
import { createTray } from './tray'
import { decryptAccounts } from './config'
import type { DisplayConfig } from './config'

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  bootstrap()
}

function bootstrap(): void {
  app.whenReady().then(() => {
    const windows = new WindowManager()
    const display = loadDisplay()
    let displayCfg: DisplayConfig = display

    const loaded = loadVendors()
    const accounts = ensureDefaultAccounts(loaded.vendors)

    // ── 阈值提醒 L2/L3:调度器每轮刷新后评估,升级才发事件 ──
    const alertManager = new AlertManager()
    const scheduler = new Scheduler(createPluginRegistry(), displayCfg, (snapshot) => {
      for (const ev of alertManager.evaluate(snapshot.entries, displayCfg.alerts)) {
        if (displayCfg.alerts.bubble) {
          const w = windows.widget
          if (w && !w.isDestroyed() && w.isVisible()) w.webContents.send('alerts:bubble', ev)
        }
        if (displayCfg.alerts.notify && Notification.isSupported()) {
          const n = new Notification({ title: ev.title, body: ev.message })
          n.on('click', () => windows.openSettings())
          n.show()
        }
      }
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('usage:updated', snapshot)
      }
    })

    const reloadAll = (): void => {
      const result = loadVendors()
      scheduler.reload(result.vendors, result.errors, loadAccounts())
    }
    scheduler.reload(loaded.vendors, loaded.errors, accounts)
    watchVendors(reloadAll)

    // ── 托盘 ──
    const tray = createTray({
      onToggleWidget: () => {
        const w = windows.widget
        if (!w || w.isDestroyed()) return
        if (w.isVisible()) w.hide()
        else w.show()
      },
      clickThroughEnabled: () => displayCfg.clickThrough,
      onToggleClickThrough: () => {
        displayCfg = { ...displayCfg, clickThrough: !displayCfg.clickThrough }
        saveDisplay(displayCfg)
        if (windows.widget) windows.applyClickThrough(windows.widget, displayCfg.clickThrough)
      },
      onRefresh: () => scheduler.refreshAll(),
      onOpenSettings: () => windows.openSettings()
    })

    // ── IPC ──
    ipcMain.handle('usage:snapshot', () => scheduler.snapshot())
    ipcMain.handle('usage:refresh', () => {
      scheduler.refreshAll()
      return true
    })
    ipcMain.handle('config:getDisplay', () => loadDisplay())
    ipcMain.handle('config:setDisplay', (_e, patch: Partial<DisplayConfig>) => {
      displayCfg = { ...loadDisplay(), ...patch }
      saveDisplay(displayCfg)
      scheduler.setDisplay(displayCfg)
      if (windows.widget) {
        windows.widget.setAlwaysOnTop(displayCfg.alwaysOnTop, 'screen-saver')
        windows.applyClickThrough(windows.widget, displayCfg.clickThrough)
      }
      // 设置页切换点击穿透后,同步托盘菜单勾选(菜单勾选在构建时求值)
      if (patch.clickThrough !== undefined) tray.refreshMenu()
      windows.broadcastSettings()
      return displayCfg
    })
    ipcMain.handle('config:vendorList', () => {
      const result = loadVendors()
      return {
        vendors: result.vendors.map((v) => ({
          id: v.id,
          name: v.name,
          kind: v.kind,
          color: v.color,
          logo: v.logo,
          homepage: v.homepage,
          fields: v.auth.fields,
          fieldHints: v.fieldHints,
          intervalMs: v.defaultIntervalMs
        })),
        errors: result.errors,
        accounts: Object.fromEntries(
          Object.entries(loadAccounts()).map(([k, list]) => [
            k,
            list.map((a) => ({ id: a.id, name: a.name, hasKey: Boolean(a.key || a.secret) }))
          ])
        )
      }
    })
    ipcMain.handle('config:openVendorsDir', async () => {
      const { shell } = await import('electron')
      await shell.openPath(userVendorsDir())
      return true
    })
    // 凭证读取(仅设置窗口使用):返回明文供表单编辑。
    // 悬浮窗共用同一 preload 但用不到此接口,校验 sender 收窄明文 Key 暴露面
    ipcMain.handle('config:getCredential', (e, vendorId: string, accountId: string) => {
      if (!windows.settings || windows.settings.isDestroyed() || e.sender !== windows.settings.webContents) {
        return null
      }
      return decryptAccounts()[vendorId]?.find((a) => a.id === accountId) ?? null
    })
    ipcMain.handle('config:saveCredential', (_e, vendorId: string, account: { id: string; name: string; key?: string; secret?: string; region?: string }) => {
      upsertAccount(vendorId, account)
      reloadAll()
      return true
    })
    ipcMain.handle('config:addAccount', (_e, vendorId: string, name: string) => {
      const id = nextAccountId(vendorId)
      upsertAccount(vendorId, { id, name: name || id })
      reloadAll()
      return id
    })
    ipcMain.handle('win:openSettings', () => {
      windows.openSettings()
      return true
    })
    ipcMain.handle('win:resizeWidget', (_e, dWidth: number, dHeight: number) => {
      const w = windows.widget
      if (!w || w.isDestroyed()) return false
      const b = w.getBounds()
      const width = Math.min(480, Math.max(220, Math.round(b.width + dWidth)))
      const height = Math.max(120, Math.round(b.height + dHeight))
      w.setSize(width, height)
      return true
    })
    // 高度自适应:按内容高度设定窗口(收起时仅工具条,约 40px,故下限 36)
    ipcMain.handle('win:setHeight', (_e, height: number) => {
      const w = windows.widget
      if (!w || w.isDestroyed()) return false
      const b = w.getBounds()
      const h = Math.min(700, Math.max(36, Math.round(height)))
      w.setSize(b.width, h)
      return true
    })
    ipcMain.handle('env:encryptionAvailable', () => isEncryptionAvailable())
    ipcMain.handle('app:version', () => app.getVersion())
    ipcMain.handle('app:openExternal', (_e, url: string) => {
      if (typeof url === 'string' && url.startsWith('https://')) {
        void import('electron').then(({ shell }) => shell.openExternal(url))
        return true
      }
      return false
    })

    // ── 生命周期 ──
    app.on('second-instance', () => {
      if (windows.widget) windows.widget.show()
    })
    app.on('window-all-closed', () => {
      // 托盘常驻,不随窗口关闭退出
    })
    ;(global as { quitting?: boolean }).quitting = false
    app.on('before-quit', () => {
      ;(global as { quitting?: boolean }).quitting = true
      scheduler.dispose()
    })

    windows.createWidget()

    // 首次运行(无任何 Key)直接打开设置页引导
    const hasAnyKey = Object.values(loadAccounts()).some((list) => list.some((a) => a.key || a.secret))
    if (!hasAnyKey) windows.openSettings()
  })
}
