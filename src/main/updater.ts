/* 自动更新:electron-updater + GitHub Releases(设计 §15)。
   仅打包态启用;启动延迟自检,下载完成后系统通知,关于页手动检查/安装。 */
import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { i18n as I18nInstance } from 'i18next'
import type { UpdateState } from '@shared/types'

export type { UpdateState, UpdateStatus } from '@shared/types'

export class Updater {
  private state: UpdateState = { status: 'idle' }
  private listeners: ((s: UpdateState) => void)[] = []

  constructor(private i18n: I18nInstance) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }))
    autoUpdater.on('update-available', (info) => this.set({ status: 'downloading', version: info.version }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'latest' }))
    autoUpdater.on('update-downloaded', (info) => {
      this.set({ status: 'downloaded', version: info.version })
      // macOS 未签名时 autoUpdater 会直接 error,能走到这里说明链路可用
      if (Notification.isSupported()) {
        const n = new Notification({
          title: this.i18n.t('updater.downloadedTitle'),
          body: this.i18n.t('updater.downloaded', { version: info.version })
        })
        n.show()
      }
    })
    autoUpdater.on('error', (err) => this.set({ status: 'error', message: String(err) }))
  }

  get current(): UpdateState {
    return this.state
  }

  onChange(cb: (s: UpdateState) => void): void {
    this.listeners.push(cb)
  }

  private set(s: UpdateState): void {
    this.state = s
    for (const cb of this.listeners) cb(s)
  }

  /** 启动后延迟自检,避免拖慢启动;dev 模式直接置为 dev 态 */
  start(): void {
    if (!app.isPackaged) {
      this.set({ status: 'dev' })
      return
    }
    setTimeout(() => void this.check(), 15_000)
  }

  /** 手动检查(关于页按钮);返回触发时的状态,后续变化经 onChange 推送 */
  check(): UpdateState {
    if (!app.isPackaged) {
      this.set({ status: 'dev' })
      return this.state
    }
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      this.set({ status: 'error', message: String(err) })
    })
    return this.state
  }

  restartAndInstall(): boolean {
    if (!app.isPackaged || this.state.status !== 'downloaded') return false
    autoUpdater.quitAndInstall()
    return true
  }
}
