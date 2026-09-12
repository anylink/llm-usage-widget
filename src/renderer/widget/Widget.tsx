import React, { useEffect, useState } from 'react'
import type { DisplayConfig, QuotaWindow, SchedulerSnapshot, UsageEntry } from '@shared/types'

const STATUS_TEXT: Record<string, string> = {
  ok: '',
  updating: '查询中…',
  network: '网络不可达 · 显示上次值',
  http: '接口异常',
  auth: '鉴权失败,请检查 Key',
  parse: '响应解析失败',
  business: '接口返回错误'
}

/** 全部未配置时展示的示例数据(套餐型,演示进度条/窗口/倒计时) */
function demoEntry(): UsageEntry {
  const now = Math.floor(Date.now() / 1000)
  return {
    vendorId: 'demo',
    vendorName: '示例厂商 · 套餐',
    accountId: 'demo',
    accountName: '示例',
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
function demoBalanceEntry(): UsageEntry {
  return {
    vendorId: 'demo-balance',
    vendorName: '示例厂商 · 余额',
    accountId: 'demo-balance',
    accountName: '示例',
    kind: 'balance',
    color: '#10b981',
    status: 'ok',
    value: 238.5,
    unit: 'CNY',
    queriedAt: Math.floor(Date.now() / 1000),
    windows: []
  }
}

function fmtCountdown(resetEpoch: number): string {
  const secs = resetEpoch - Date.now() / 1000
  if (secs <= 0) return '即将重置'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h >= 24) return `${Math.floor(h / 24)}天${h % 24}时后重置`
  return h > 0 ? `${h}时${m}分后重置` : `${m}分后重置`
}

function fmtAge(queriedAt: number): string {
  const secs = Math.max(0, Date.now() / 1000 - queriedAt)
  if (secs < 60) return '刚刚更新'
  if (secs < 3600) return `${Math.floor(secs / 60)} 分钟前更新`
  return `${Math.floor(secs / 3600)} 小时前更新`
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

/* 单卡片(轮播模式与示例共用) */
function Card({
  entry,
  display,
  isDemo,
  footLeft,
  extraHead
}: {
  entry: UsageEntry
  display: DisplayConfig
  isDemo?: boolean
  footLeft?: string
  extraHead?: React.ReactNode
}) {
  const primary = entry.windows?.[0]
  const alerts = display.alerts
  const errText = STATUS_TEXT[entry.status] ?? ''
  return (
    <div className="card" style={{ ['--accent' as string]: entry.color }}>
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
                  <span className="win-reset">{w.resetEpoch ? fmtCountdown(w.resetEpoch) : ''}</span>
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
          <div className={`state ${entry.status === 'auth' ? 'state-err' : ''}`}>{errText || '查询中…'}</div>
        )}
        {isDemo && <div className="demo-note">示例数据 · 配置任意厂商后展示真实用量</div>}
      </div>

      <div className="foot drag">
        <span className="foot-left">{footLeft ?? ''}</span>
        <span className={`foot-status ${entry.status === 'ok' ? '' : 'foot-warn'}`}>
          {entry.status === 'ok' ? fmtAge(entry.queriedAt) : errText}
        </span>
      </div>
    </div>
  )
}

/* 列表模式:全部已配置厂商一屏展示(全部未配置时以两行示例演示套餐/余额两种形态) */
function ListMode({
  entries,
  display,
  isDemo
}: {
  entries: UsageEntry[]
  display: DisplayConfig
  isDemo?: boolean
}) {
  const alerts = display.alerts
  return (
    <div className="card list" id="list-card">
      <div className="head drag">
        <span className="name">{isDemo ? '示例展示' : `全部厂商 (${entries.length})`}</span>
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
                <span className="li-val li-err" title={STATUS_TEXT[e.status] ?? ''}>
                  {e.status === 'updating' ? '…' : '!'}
                </span>
              )}
            </div>
          )
        })}
        {isDemo && <div className="demo-note">示例数据 · 套餐与余额两种形态,配置任意厂商后展示真实用量</div>}
      </div>
      <div className="foot drag">
        <span className="foot-left">{isDemo ? '未配置' : ''}</span>
        <span className="foot-status">
          {isDemo
            ? ''
            : entries.every((e) => e.status === 'ok')
              ? fmtAge(entries[0]?.queriedAt ?? Date.now() / 1000)
              : '部分厂商状态异常'}
        </span>
      </div>
    </div>
  )
}

export function Widget() {
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(null)
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [page, setPage] = useState(0)
  const [, setTick] = useState(0) // 倒计时每秒重绘

  useEffect(() => {
    void window.api.getSnapshot().then((s) => setSnapshot(s as SchedulerSnapshot))
    void window.api.getDisplay().then((d) => setDisplay(d as DisplayConfig))
    window.api.onUsageUpdated((s) => setSnapshot(s as SchedulerSnapshot))
    window.api.onDisplayChanged((d) => setDisplay(d as DisplayConfig))
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // 自动翻页(仅轮播)
  useEffect(() => {
    if (!display || display.mode !== 'carousel' || !display.autoCycleMs) return
    const t = setInterval(() => setPage((p) => p + 1), display.autoCycleMs)
    return () => clearInterval(t)
  }, [display?.mode, display?.autoCycleMs])

  // 两种模式统一:窗口高度自适应内容自然高度(卡片不拉伸,量到的是内容值;
  // 高度未变化时不重复 setSize,避免每次轮询都把窗口顶长一截)
  const lastFitRef = React.useRef(0)
  useEffect(() => {
    if (!display) return
    const el =
      display.mode === 'list'
        ? document.getElementById('list-card')
        : document.querySelector<HTMLElement>('.card')
    if (!el) return
    const h = Math.min(700, Math.max(120, Math.round(el.offsetHeight + 6)))
    if (Math.abs(h - lastFitRef.current) > 2) {
      lastFitRef.current = h
      void window.api.setHeight(h)
    }
  }, [display?.mode, display?.bgOpacity, snapshot?.dataGen, page])

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

  // 全部未配置:示例展示(轮播显单卡片;列表显套餐+余额两行)
  if (configured.length === 0) {
    const demoHandle = (
      <div
        className="resize-handle no-drag"
        onMouseDown={(e) => {
          e.preventDefault()
          let lastX = e.screenX
          let lastY = e.screenY
          const move = (ev: MouseEvent): void => {
            void window.api.resizeWidget(ev.screenX - lastX, ev.screenY - lastY)
            lastX = ev.screenX
            lastY = ev.screenY
          }
          const up = (): void => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      />
    )
    if (display.mode === 'list') {
      return (
        <div
          className="root"
          style={rootStyle}
        >
          <ListMode entries={[demoEntry(), demoBalanceEntry()]} display={display} isDemo />
          {demoHandle}
        </div>
      )
    }
    return (
      <div
        className="root"
        style={rootStyle}
      >
        <Card entry={demoEntry()} display={display} isDemo footLeft="未配置" />
        {demoHandle}
      </div>
    )
  }

  // 列表模式
  if (display.mode === 'list') {
    return (
      <div
        className="root"
        style={rootStyle}
      >
        <ListMode entries={configured} display={display} />
        <div
          className="resize-handle no-drag"
          onMouseDown={(e) => {
            e.preventDefault()
            let lastX = e.screenX
            let lastY = e.screenY
            const move = (ev: MouseEvent): void => {
              void window.api.resizeWidget(ev.screenX - lastX, ev.screenY - lastY)
              lastX = ev.screenX
              lastY = ev.screenY
            }
            const up = (): void => {
              window.removeEventListener('mousemove', move)
              window.removeEventListener('mouseup', up)
            }
            window.addEventListener('mousemove', move)
            window.addEventListener('mouseup', up)
          }}
        />
      </div>
    )
  }

  // 轮播模式(仅已配置厂商)
  const count = configured.length
  const entry = configured[page % count]
  return (
    <div
      className="root"
      style={rootStyle}
    >
      <Card
        entry={entry}
        display={display}
        footLeft={count > 1 ? `${(page % count) + 1} / ${count}` : ''}
        extraHead={
          <>
            {count > 1 && (
              <>
                <button className="btn" title="上一家" onClick={() => setPage((p) => p - 1)}>
                  ‹
                </button>
                <button className="btn" title="下一家" onClick={() => setPage((p) => p + 1)}>
                  ›
                </button>
              </>
            )}
            <button className="btn" title="立即刷新" onClick={() => void window.api.refresh()}>
              ↻
            </button>
          </>
        }
      />
      <div
        className="resize-handle no-drag"
        onMouseDown={(e) => {
          e.preventDefault()
          let lastX = e.screenX
          let lastY = e.screenY
          const move = (ev: MouseEvent): void => {
            void window.api.resizeWidget(ev.screenX - lastX, ev.screenY - lastY)
            lastX = ev.screenX
            lastY = ev.screenY
          }
          const up = (): void => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      />
    </div>
  )
}
