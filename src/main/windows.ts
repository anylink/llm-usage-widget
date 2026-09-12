/* 窗口管理:悬浮窗(无边框透明置顶)+ 设置窗(常规) */
import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { loadDisplay, saveDisplay } from './config'

/** dev 模式走 electron-vite dev server,build 后走 out/renderer 静态文件 */
function loadRenderer(win: BrowserWindow, page: 'widget' | 'settings'): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(`${devUrl}/${page}/index.html`)
  else void win.loadFile(path.join(__dirname, `../renderer/${page}/index.html`))
}

export class WindowManager {
  widget?: BrowserWindow
  settings?: BrowserWindow
  private saveTimer?: NodeJS.Timeout

  createWidget(): BrowserWindow {
    const display = loadDisplay()
    const { workArea } = screen.getPrimaryDisplay()
    const width = display.widget.width || 300
    const height = display.widget.height ?? 200
    const x = display.widget.x ?? workArea.x + workArea.width - width - 40
    const y = display.widget.y ?? workArea.y + 80

    const win = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: display.alwaysOnTop,
      skipTaskbar: true,
      resizable: true,
      minWidth: 220,
      maxWidth: 480,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    win.setAlwaysOnTop(display.alwaysOnTop, 'screen-saver')
    loadRenderer(win, 'widget')
    win.once('ready-to-show', () => win.show())
    this.applyClickThrough(win, display.clickThrough)

    // 位置/尺寸持久化(防抖)
    const persist = (): void => {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(() => {
        const cfg = loadDisplay()
        const b = win.getBounds()
        cfg.widget = { x: b.x, y: b.y, width: b.width, height: b.height }
        saveDisplay(cfg)
      }, 600)
    }
    win.on('moved', persist)
    win.on('resized', persist)
    win.on('close', (e) => {
      // 关闭 = 隐藏,托盘"退出"才真正退出
      if (!(global as { quitting?: boolean }).quitting) {
        e.preventDefault()
        win.hide()
      }
    })

    this.widget = win
    return win
  }

  applyClickThrough(win: BrowserWindow, on: boolean): void {
    win.setIgnoreMouseEvents(on, { forward: true })
  }

  openSettings(): BrowserWindow {
    if (this.settings && !this.settings.isDestroyed()) {
      this.settings.show()
      this.settings.focus()
      return this.settings
    }
    const win = new BrowserWindow({
      width: 760,
      height: 560,
      title: 'LLM Usage Widget 设置',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    loadRenderer(win, 'settings')
    win.on('closed', () => (this.settings = undefined))
    this.settings = win
    return win
  }

  broadcastSettings(): void {
    for (const w of [this.widget, this.settings]) {
      if (w && !w.isDestroyed()) w.webContents.send('display:changed', loadDisplay())
    }
  }
}
