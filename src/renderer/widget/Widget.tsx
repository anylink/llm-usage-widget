import { useEffect, useState } from 'react'
import type { DisplayConfig, EntryStatus, SchedulerSnapshot, UsageEntry } from '@shared/types'

const STATUS_TEXT: Record<EntryStatus, string> = {
  ok: '',
  updating: '查询中…',
  'no-key': '未配置 Key',
  network: '网络不可达 · 显示上次值',
  http: '接口异常',
  auth: '鉴权失败,请检查 Key',
  parse: '响应解析失败',
  business: '接口返回错误',
  disabled: '已停用'
}

function fmtCountdown(resetEpoch: number): string {
  const secs = resetEpoch - Date.now() / 1000
  if (secs <= 0) return '即将重置'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    return `${d}天${h % 24}时后重置`
  }
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

  // 自动翻页
  useEffect(() => {
    if (!display?.autoCycleMs) return
    const t = setInterval(() => setPage((p) => p + 1), display.autoCycleMs)
    return () => clearInterval(t)
  }, [display?.autoCycleMs])

  const entries = snapshot?.entries ?? []
  if (!display) return <div className="root" />
  const count = entries.length
  const entry: UsageEntry | undefined = count > 0 ? entries[page % count] : undefined

  const primary = entry?.windows?.[0]
  const alerts = display.alerts

  return (
    <div className="root" style={{ opacity: display.opacity }}>
      {entry ? (
        <div className="card" style={{ ['--accent' as string]: entry.color }}>
          <div className="head drag">
            <Monogram name={entry.vendorName} color={entry.color} />
            <span className="name" title={`${entry.vendorName} · ${entry.accountName}`}>
              {entry.vendorName}
            </span>
            <span className="head-btns no-drag">
              <button className="btn" title="上一家" onClick={() => setPage((p) => p - 1)}>
                ‹
              </button>
              <button className="btn" title="下一家" onClick={() => setPage((p) => p + 1)}>
                ›
              </button>
              <button
                className="btn"
                title="立即刷新"
                onClick={() => void window.api.refresh()}
              >
                ↻
              </button>
            </span>
          </div>

          <div className="body">
            {entry.kind === 'quota' && primary ? (
              <>
                <div className="bar">
                  <div
                    className="bar-fill"
                    style={{ width: `${Math.min(100, primary.utilization)}%`, background: barColor(primary.utilization, alerts) }}
                  />
                </div>
                <div className="pct" style={{ color: barColor(primary.utilization, alerts) }}>
                  {primary.utilization}%
                </div>
                <div className="windows">
                  {entry.windows.map((w) => (
                    <div className="win-row" key={w.label}>
                      <span className="win-label">{w.label}</span>
                      <span className="win-bar">
                        <span
                          className="win-bar-fill"
                          style={{ width: `${Math.min(100, w.utilization)}%`, background: barColor(w.utilization, alerts) }}
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
              <div className={`state ${entry.status === 'auth' ? 'state-err' : ''}`}>
                {STATUS_TEXT[entry.status]}
              </div>
            )}
          </div>

          <div className="foot drag">
            <span className="foot-left">
              {count > 1 ? `${(page % count) + 1}/${count}` : ''}
            </span>
            <span className={`foot-status ${entry.status === 'ok' ? '' : 'foot-warn'}`}>
              {entry.status === 'ok'
                ? fmtAge(entry.queriedAt)
                : STATUS_TEXT[entry.status]}
            </span>
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="head drag">
            <span className="name">LLM Usage Widget</span>
          </div>
          <div className="body">
            <div className="state">
              {snapshot?.vendorErrors?.length
                ? '厂商配置有误,请检查'
                : '尚未查询到数据,请在设置中配置 API Key'}
            </div>
            <button className="btn setup no-drag" onClick={() => void window.api.openSettings()}>
              打开设置
            </button>
          </div>
          <div className="foot drag" />
        </div>
      )}
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
