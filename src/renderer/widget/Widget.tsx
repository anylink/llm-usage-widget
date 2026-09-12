import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { AlertEvent, DisplayConfig, QuotaWindow, SchedulerSnapshot, ThemePayload, UsageEntry } from '@shared/types'
import { i18n } from './i18n'
import { resolveLocale } from '@shared/i18n'

/** 状态 → 本地化文案('ok' 返回空) */
function statusText(t: TFunction, status: string): string {
  switch (status) {
    case 'updating':
      return t('status.updating')
    case 'network':
      return t('status.network')
    case 'http':
      return t('status.http')
    case 'auth':
      return t('status.auth')
    case 'parse':
      return t('status.parse')
    case 'business':
      return t('status.business')
    default:
      return ''
  }
}

/** 全部未配置时展示的示例数据(套餐型,演示进度条/窗口/倒计时) */
function demoEntry(t: TFunction): UsageEntry {
  const now = Math.floor(Date.now() / 1000)
  return {
    vendorId: 'demo',
    vendorName: t('widget.demoQuotaVendor'),
    accountId: 'demo',
    accountName: t('widget.demoAccount'),
    kind: 'quota',
    color: '#4d6bfe',
    status: 'ok',
    queriedAt: now,
    windows: [
      { label: '5h', utilization: 62, resetEpoch: now + 3 * 3600 + 1200 },
      { label: 'wk', utilization: 31, resetEpoch: now + 2 * 86400 },
      { label: 'mo', utilization: 12 }
    ]
  }
}

/** 全部未配置时展示的示例数据(余额型,演示金额+币种) */
function demoBalanceEntry(t: TFunction): UsageEntry {
  return {
    vendorId: 'demo-balance',
    vendorName: t('widget.demoBalanceVendor'),
    accountId: 'demo-balance',
    accountName: t('widget.demoAccount'),
    kind: 'balance',
    color: '#10b981',
    status: 'ok',
    value: 238.5,
    unit: 'CNY',
    queriedAt: Math.floor(Date.now() / 1000),
    windows: []
  }
}

function fmtCountdown(resetEpoch: number, t: TFunction): string {
  const secs = resetEpoch - Date.now() / 1000
  if (secs <= 0) return t('widget.resetting')
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h >= 24) return t('widget.resetInDays', { d: Math.floor(h / 24), h: h % 24 })
  return h > 0 ? t('widget.resetInHours', { h, m }) : t('widget.resetInMinutes', { m })
}

function fmtAge(queriedAt: number, t: TFunction): string {
  const secs = Math.max(0, Date.now() / 1000 - queriedAt)
  if (secs < 60) return t('widget.justUpdated')
  if (secs < 3600) return t('widget.minutesAgo', { count: Math.floor(secs / 60) })
  return t('widget.hoursAgo', { count: Math.floor(secs / 3600) })
}

function barColor(u: number, alerts: DisplayConfig['alerts']): string {
  if (u >= alerts.critPct) return 'var(--danger)'
  if (u >= alerts.warnPct) return 'var(--warn)'
  return 'var(--ok)'
}

function Monogram({ name, color }: { name: string; color: string }) {
  return (
    <span className="logo" style={{ background: color }}>
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

/* 顶部工具条小图标(线性,跟随文字色) */
function TIcon({ d }: { d: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  collapseUp: 'M6 15l6-6 6 6',
  collapseDown: 'M6 9l6 6 6-6',
  toList: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  toCarousel: 'M9 9h11v11H9zM5 15V5a2 2 0 0 1 2-2h10',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-.9',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4.6 12a7.4 7.4 0 0 1 .1-1.2L2.8 9.3l2-3.4 1.9.8a7.4 7.4 0 0 1 2-1.2L9 3.4h6l.3 2.1a7.4 7.4 0 0 1 2 1.2l1.9-.8 2 3.4-1.9 1.5a7.4 7.4 0 0 1 0 2.4l1.9 1.5-2 3.4-1.9-.8a7.4 7.4 0 0 1-2 1.2L15 20.6H9l-.3-2.1a7.4 7.4 0 0 1-2-1.2l-1.9.8-2-3.4 1.9-1.5a7.4 7.4 0 0 1-.1-1.2z'
}

/* 顶部工具行:与内容同卡片;平时整行是拖动区,鼠标移到卡片顶部时按钮渐显 */
function Toolbar({
  display,
  onPatch,
  onOpenSettings
}: {
  display: DisplayConfig
  onPatch(patch: Partial<DisplayConfig>): void
  onOpenSettings(): void
}) {
  const { t } = useTranslation()
  const collapsed = display.collapsed
  return (
    <div className="toolbar drag">
      <button
        className="tbtn no-drag"
        title={collapsed ? t('widget.expand') : t('widget.collapse')}
        onClick={() => onPatch({ collapsed: !collapsed })}
      >
        <TIcon d={collapsed ? ICONS.collapseDown : ICONS.collapseUp} />
      </button>
      <button
        className="tbtn no-drag"
        title={display.mode === 'carousel' ? t('widget.switchToList') : t('widget.switchToCarousel')}
        onClick={() => onPatch({ mode: display.mode === 'carousel' ? 'list' : 'carousel' })}
      >
        <TIcon d={display.mode === 'carousel' ? ICONS.toList : ICONS.toCarousel} />
      </button>
      <span className="t-title">{t('app.name')}</span>
      <button
        className={`tbtn no-drag ${display.locked ? 't-on' : ''}`}
        title={display.locked ? t('widget.unlock') : t('widget.lock')}
        onClick={() => onPatch({ locked: !display.locked })}
      >
        <TIcon d={display.locked ? ICONS.lock : ICONS.unlock} />
      </button>
      <button className="tbtn no-drag" title={t('widget.openSettings')} onClick={onOpenSettings}>
        <TIcon d={ICONS.gear} />
      </button>
    </div>
  )
}

/* 单卡片(轮播模式与示例共用);toolbar 为卡片内部顶端的工具行 */
function Card({
  entry,
  display,
  isDemo,
  footLeft,
  extraHead,
  toolbar
}: {
  entry: UsageEntry
  display: DisplayConfig
  isDemo?: boolean
  footLeft?: string
  extraHead?: React.ReactNode
  toolbar?: React.ReactNode
}) {
  const { t } = useTranslation()
  const primary = entry.windows?.[0]
  const alerts = display.alerts
  const errText = statusText(t, entry.status)
  return (
    <div className="card" style={{ ['--accent' as string]: entry.color }}>
      {toolbar}
      <div className="head drag">
        <Monogram name={entry.vendorName} color={entry.color} />
        <span className="name" title={`${entry.vendorName} · ${entry.accountName}`}>
          {entry.vendorName}
        </span>
        <span className="head-btns no-drag">{extraHead}</span>
      </div>

      <div className="body">
        {entry.kind === 'quota' && primary ? (
          <>
            <div className="bar">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.min(100, primary.utilization)}%`,
                  background: barColor(primary.utilization, alerts)
                }}
              />
            </div>
            <div className="pct" style={{ color: barColor(primary.utilization, alerts) }}>
              {primary.utilization}%
            </div>
            <div className="windows">
              {entry.windows.map((w: QuotaWindow) => (
                <div className="win-row" key={w.label}>
                  <span className="win-label">{w.label}</span>
                  <span className="win-bar">
                    <span
                      className="win-bar-fill"
                      style={{
                        width: `${Math.min(100, w.utilization)}%`,
                        background: barColor(w.utilization, alerts)
                      }}
                    />
                  </span>
                  <span className="win-val">{w.utilization}%</span>
                  <span className="win-reset">{w.resetEpoch ? fmtCountdown(w.resetEpoch, t) : ''}</span>
                </div>
              ))}
            </div>
          </>
        ) : entry.kind === 'balance' && entry.status === 'ok' ? (
          <div className="balance">
            <span className="balance-num">{entry.value}</span>
            <span className="balance-unit">{entry.unit}</span>
          </div>
        ) : (
          <div className={`state ${entry.status === 'auth' ? 'state-err' : ''}`}>{errText || t('status.updating')}</div>
        )}
        {isDemo && <div className="demo-note">{t('widget.demoNote')}</div>}
      </div>

      <div className="foot drag">
        <span className="foot-left">{footLeft ?? ''}</span>
        <span className={`foot-status ${entry.status === 'ok' ? '' : 'foot-warn'}`}>
          {entry.status === 'ok' ? fmtAge(entry.queriedAt, t) : errText}
        </span>
      </div>
    </div>
  )
}

/* 列表模式:全部已配置厂商一屏展示(全部未配置时以两行示例演示套餐/余额两种形态) */
function ListMode({
  entries,
  display,
  isDemo,
  toolbar
}: {
  entries: UsageEntry[]
  display: DisplayConfig
  isDemo?: boolean
  toolbar?: React.ReactNode
}) {
  const { t } = useTranslation()
  const alerts = display.alerts
  return (
    <div className="card list" id="list-card">
      {toolbar}
      <div className="head drag">
        <span className="name">{isDemo ? t('widget.listDemoTitle') : t('widget.listTitle', { count: entries.length })}</span>
      </div>
      <div className="list-body">
        {entries.map((e) => {
          const primary = e.windows?.[0]
          return (
            <div className="li-row" key={e.accountId}>
              <Monogram name={e.vendorName} color={e.color} />
              <div className="li-main">
                <div className="li-name">
                  {e.vendorName}
                  {entries.some((x) => x.vendorId === e.vendorId && x.accountId !== e.accountId) && (
                    <span className="li-acc">· {e.accountName}</span>
                  )}
                </div>
                {e.kind === 'quota' && primary ? (
                  <span className="li-bar">
                    <span
                      className="win-bar-fill"
                      style={{
                        width: `${Math.min(100, primary.utilization)}%`,
                        background: barColor(primary.utilization, alerts)
                      }}
                    />
                  </span>
                ) : (
                  <span className="li-bar li-bar-flat" />
                )}
              </div>
              {e.kind === 'quota' && primary ? (
                <span className="li-val" style={{ color: barColor(primary.utilization, alerts) }}>
                  {primary.utilization}%
                </span>
              ) : e.kind === 'balance' && e.status === 'ok' ? (
                <span className="li-val">
                  {e.value} <em>{e.unit}</em>
                </span>
              ) : (
                <span className="li-val li-err" title={statusText(t, e.status)}>
                  {e.status === 'updating' ? '…' : '!'}
                </span>
              )}
            </div>
          )
        })}
        {isDemo && <div className="demo-note">{t('widget.demoListNote')}</div>}
      </div>
      <div className="foot drag">
        <span className="foot-left">{isDemo ? t('widget.notConfigured') : ''}</span>
        <span className="foot-status">
          {isDemo
            ? ''
            : entries.every((e) => e.status === 'ok')
              ? fmtAge(entries[0]?.queriedAt ?? Date.now() / 1000, t)
              : t('widget.listPartialError')}
        </span>
      </div>
    </div>
  )
}

export function Widget() {
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null)
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [themes, setThemes] = useState<ThemePayload | null>(null)
  const [bubble, setBubble] = useState<AlertEvent | null>(null)
  const [page, setPage] = useState(0)
  const [, setTick] = useState(0) // 倒计时每秒重绘
  const bubbleTimer = useRef<number | undefined>(undefined)
  const { t } = useTranslation()

  useEffect(() => {
    void window.api.getSnapshot().then((s) => setSnapshot(s as SchedulerSnapshot))
    void window.api.getDisplay().then((d) => {
      setDisplay(d as DisplayConfig)
      // 按用户偏好校正语言(auto = 系统语言)
      const cfg = d as DisplayConfig
      void i18n.changeLanguage(resolveLocale(cfg.locale, navigator.language))
    })
    window.api.onUsageUpdated((s) => setSnapshot(s as SchedulerSnapshot))
    window.api.onDisplayChanged((d) => {
      setDisplay(d as DisplayConfig)
      // 运行中语言切换:与初始加载同款校正
      const cfg = d as DisplayConfig
      void i18n.changeLanguage(resolveLocale(cfg.locale, navigator.language))
    })
    // L2 气泡:主进程评估出的阈值告警,8 秒自动收回;多条紧随其后时后到覆盖先到
    window.api.onAlertBubble((ev) => {
      setBubble(ev as AlertEvent)
      clearTimeout(bubbleTimer.current)
      bubbleTimer.current = window.setTimeout(() => setBubble(null), 8000)
    })
    void window.api.getThemes().then((t2) => setThemes(t2 as ThemePayload))
    window.api.onThemesChanged((t2) => setThemes(t2 as ThemePayload))
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => {
      clearInterval(t)
      clearTimeout(bubbleTimer.current)
    }
  }, [])

  // 主题包:内置主题映射 body[data-theme];用户主题 CSS 另行注入
  useEffect(() => {
    document.body.dataset.theme = display && display.theme !== 'dark' ? display.theme : ''
    // 字体颜色覆盖:副色按 62% 透明度派生,任意主题底色下都可读
    const v = display?.textColor?.trim() ?? ''
    if (v) {
      document.body.style.setProperty('--tp', v)
      document.body.style.setProperty('--ts', `color-mix(in srgb, ${v} 62%, transparent)`)
    } else {
      document.body.style.removeProperty('--tp')
      document.body.style.removeProperty('--ts')
    }
  }, [display?.theme, display?.textColor])

  // 用户主题 CSS 注入(变更时清旧重注;约定选择器 body[data-theme='文件名'])
  useEffect(() => {
    document.querySelectorAll('style[data-user-theme]').forEach((el) => el.remove())
    for (const th of themes?.user ?? []) {
      const s = document.createElement('style')
      s.dataset.userTheme = th.id
      s.textContent = th.css
      document.head.appendChild(s)
    }
  }, [themes])

  // 自动翻页(仅轮播)
  useEffect(() => {
    if (!display || display.mode !== 'carousel' || !display.autoCycleMs) return
    const t = setInterval(() => setPage((p) => p + 1), display.autoCycleMs)
    return () => clearInterval(t)
  }, [display?.mode, display?.autoCycleMs])

  // 两种模式统一:窗口高度自适应内容自然高度。量 .root 的全部流内子元素
  // (工具条 + 卡片/列表,含外边距),绝对/固定定位的气泡与缩放手柄不计入;
  // 收起时只剩工具条,高度随之收缩,不留透明点击盲区。
  // 高度未变化时不重复 setSize,避免每次轮询都把窗口顶长一截
  const lastFitRef = React.useRef(0)
  useEffect(() => {
    if (!display) return
    const root = document.querySelector<HTMLElement>('.root')
    if (!root) return
    let content = 0
    for (const child of root.children) {
      const c = child as HTMLElement
      const cs = getComputedStyle(c)
      if (cs.position === 'absolute' || cs.position === 'fixed') continue
      content += c.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)
    }
    const h = Math.min(700, Math.max(36, Math.round(content + 6)))
    if (Math.abs(h - lastFitRef.current) > 2) {
      lastFitRef.current = h
      void window.api.setHeight(h)
    }
  }, [display?.mode, display?.collapsed, display?.bgOpacity, snapshot?.dataGen, page])

  if (!display) return <div className="root" />

  // 背景接近全透明时,文字直接贴桌面,自动加描边阴影保证浅色壁纸下可读
  const textShadow =
    display.bgOpacity < 0.3 ? '0 1px 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)' : 'none'
  // 边框随背景透明度反向增强:背景全透时边框最清晰(Win11 框选样式),不透明时极淡
  const borderAlpha =
    display.bgOpacity >= 0.5 ? 0.08 : 0.08 + (1 - display.bgOpacity / 0.5) * 0.32
  const rootStyle = {
    ['--bg-alpha']: String(display.bgOpacity),
    ['--border-alpha']: String(Math.round(borderAlpha * 100) / 100),
    textShadow
  } as React.CSSProperties

  const entries = snapshot?.entries ?? []
  const configured = entries.filter((e) => e.status !== 'no-key')

  const patchDisplay = (patch: Partial<DisplayConfig>): void => {
    void window.api.setDisplay(patch).then((d) => setDisplay(d as DisplayConfig))
  }

/* 四边 + 右下角缩放手柄(自绘;左/上边拖动 = 移动该边,另一侧保持不动) */
function ResizeHandles(): React.ReactElement {
  const start =
    (dir: string) =>
    (e: React.MouseEvent): void => {
      e.preventDefault()
      let lastX = e.screenX
      let lastY = e.screenY
      const move = (ev: MouseEvent): void => {
        const dx = ev.screenX - lastX
        const dy = ev.screenY - lastY
        lastX = ev.screenX
        lastY = ev.screenY
        const d = { dW: 0, dH: 0, dX: 0, dY: 0 }
        if (dir.includes('e')) d.dW = dx
        if (dir.includes('s')) d.dH = dy
        if (dir.includes('w')) {
          d.dX = dx
          d.dW = -dx
        }
        if (dir.includes('n')) {
          d.dY = dy
          d.dH = -dy
        }
        void window.api.resizeWidget(d)
      }
      const up = (): void => {
        window.removeEventListener('mousemove', move)
        window.removeEventListener('mouseup', up)
      }
      window.addEventListener('mousemove', move)
      window.addEventListener('mouseup', up)
    }
  return (
    <>
      <div className="rz rz-e no-drag" onMouseDown={start('e')} />
      <div className="rz rz-w no-drag" onMouseDown={start('w')} />
      <div className="rz rz-s no-drag" onMouseDown={start('s')} />
      <div className="rz rz-n no-drag" onMouseDown={start('n')} />
      <div className="rz rz-se no-drag" onMouseDown={start('se')} />
    </>
  )
}

  const toolbar = (
    <Toolbar display={display} onPatch={patchDisplay} onOpenSettings={() => void window.api.openSettings()} />
  )

  // 各形态内容(全部未配置时用示例数据演示)
  let body: React.ReactNode
  if (configured.length === 0) {
    body =
      display.mode === 'list' ? (
        <ListMode entries={[demoEntry(t), demoBalanceEntry(t)]} display={display} isDemo toolbar={toolbar} />
      ) : (
        <Card entry={demoEntry(t)} display={display} isDemo footLeft={t('widget.notConfigured')} toolbar={toolbar} />
      )
  } else if (display.mode === 'list') {
    body = <ListMode entries={configured} display={display} toolbar={toolbar} />
  } else {
    const count = configured.length
    const entry = configured[page % count]
    body = (
      <Card
        entry={entry}
        display={display}
        toolbar={toolbar}
        footLeft={count > 1 ? t('widget.pageIndicator', { cur: (page % count) + 1, total: count }) : ''}
        extraHead={
          <>
            {count > 1 && (
              <>
                <button className="btn" title={t('widget.prevVendor')} onClick={() => setPage((p) => p - 1)}>
                  ‹
                </button>
                <button className="btn" title={t('widget.nextVendor')} onClick={() => setPage((p) => p + 1)}>
                  ›
                </button>
              </>
            )}
            <button className="btn" title={t('widget.refreshNow')} onClick={() => void window.api.refresh()}>
              ↻
            </button>
          </>
        }
      />
    )
  }

  return (
    <div className={`root ${display.locked ? 'locked' : ''}`} style={rootStyle}>
      {/* 收起时:仅剩标题常显的紧凑卡片,鼠标移入顶部再显按钮 */}
      {display.collapsed ? <div className="card collapsed-card">{toolbar}</div> : body}
      {bubble && (
        <div
          className={`bubble bubble-${bubble.level} no-drag`}
          title={t('bubble.clickToOpen')}
          onClick={() => void window.api.openSettings()}
        >
          <span className="bubble-dot" style={{ background: bubble.color }} />
          <span className="bubble-text">{bubble.message}</span>
          <button
            className="bubble-x"
            title={t('bubble.close')}
            onClick={(e) => {
              e.stopPropagation()
              setBubble(null)
            }}
          >
            ×
          </button>
        </div>
      )}
      <ResizeHandles />
    </div>
  )
}
