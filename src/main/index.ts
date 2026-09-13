/* 主进程入口:单实例、窗口、托盘、调度器、IPC 组装 */
import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { createPluginRegistry } from './engine/plugins'
import { loadVendors, watchVendors, userVendorsDir } from './engine/loader'
import { Scheduler } from './scheduler'
import { AlertManager } from './alerts'
import { createI18n, resolveLocale } from '@shared/i18n'
import { Updater } from './updater'
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
import { themesPayload, watchThemes } from './themes'
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

    // ── i18n(主进程:托盘/告警/通知)与自动更新 ──
    const i18n = createI18n(resolveLocale(displayCfg.locale, app.getLocale()))
    const updater = new Updater(i18n)
    updater.onChange((s) => {
      const w = windows.settings
      if (w && !w.isDestroyed()) w.webContents.send('update:status', s)
    })

    // ── 阈值提醒 L2/L3:调度器每轮刷新后评估,升级才发事件 ──
    const alertManager = new AlertManager((key, params) => i18n.t(key, params))
    const scheduler = new Scheduler(createPluginRegistry(), displayCfg, (snapshot) => {
      for (const ev of alertManager.evaluate(snapshot.entries, displayCfg.alerts)) {
        // L3 系统通知可按厂商覆盖开关(设计 §10.2);气泡为全局开关
        const notifyOn = displayCfg.alerts.overrides?.[ev.vendorId]?.notify ?? displayCfg.alerts.notify
        if (displayCfg.alerts.bubble) {
          const w = windows.widget
          if (w && !w.isDestroyed() && w.isVisible()) w.webContents.send('alerts:bubble', ev)
        }
        if (notifyOn && Notification.isSupported()) {
          const n = new Notification({ title: ev.title, body: ev.message })
          n.on('click', () => windows.openSettings(i18n.t('app.settingsTitle')))
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

    // ── 主题清单与用户主题热加载 ──
    const broadcastThemes = (): void => {
      const payload = themesPayload()
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('themes:changed', payload)
      }
    }
    ipcMain.handle('themes:list', () => themesPayload())
    watchThemes(broadcastThemes)

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
      onOpenSettings: () => windows.openSettings(i18n.t('app.settingsTitle'))
    }, i18n)

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
        windows.applyThemeMaterial(windows.widget, displayCfg.theme)
      }
      // 设置页切换点击穿透后,同步托盘菜单勾选(菜单勾选在构建时求值)
      if (patch.clickThrough !== undefined) tray.refreshMenu()
      // 切换语言:主进程即时生效(托盘菜单/窗口标题/后续告警文案)
      if (patch.locale !== undefined) {
        void i18n.changeLanguage(resolveLocale(patch.locale, app.getLocale())).then(() => {
          tray.refreshMenu()
          if (windows.settings && !windows.settings.isDestroyed()) {
            windows.settings.setTitle(i18n.t('app.settingsTitle'))
          }
        })
      }
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
      windows.openSettings(i18n.t('app.settingsTitle'))
      return true
    })
    // 缩放:右/下/角直接改宽高;左/上边先移位置再收宽度(高度仅当下生效,自适应逻辑仍会纠正)
    ipcMain.handle('win:resizeWidget', (_e, d: { dW: number; dH: number; dX: number; dY: number }) => {
      const w = windows.widget
      if (!w || w.isDestroyed()) return false
      const b = w.getBounds()
      let x = b.x
      let y = b.y
      let width = d.dX ? b.width - d.dX : b.width + (d.dW ?? 0)
      let height = d.dY ? b.height - d.dY : b.height + (d.dH ?? 0)
      if (d.dX) x = b.x + d.dX
      if (d.dY) y = b.y + d.dY
      width = Math.min(480, Math.max(220, Math.round(width)))
      height = Math.min(700, Math.max(36, Math.round(height)))
      w.setBounds({ x: Math.round(x), y: Math.round(y), width, height })
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
    // ── 自动更新 ──
    ipcMain.handle('app:checkUpdate', () => updater.check())
    ipcMain.handle('app:installUpdate', () => updater.restartAndInstall())
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
    updater.start()

    // 首次运行(无任何 Key)直接打开设置页引导
    const hasAnyKey = Object.values(loadAccounts()).some((list) => list.some((a) => a.key || a.secret))
    if (!hasAnyKey) windows.openSettings()
  })
}
