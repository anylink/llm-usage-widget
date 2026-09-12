/* 设置窗口:左侧导航 + 右侧内容(布局参考 Clawd on Desk 的设置框架,功能仅含本项目已实现的) */
import React, { useEffect, useState } from 'react'
import type { DisplayConfig } from '@shared/types'

interface VendorRow {
  id: string
  name: string
  kind: string
  color: string
  homepage?: string
  fields: string[]
  fieldHints?: Record<string, string>
}
interface VendorListResp {
  vendors: VendorRow[]
  errors: { file: string; message: string }[]
  accounts: Record<string, { id: string; name: string; hasKey: boolean }[]>
}
interface CredentialForm {
  name: string
  key: string
  secret: string
  region: string
}

const FIELD_LABELS: Record<string, string> = {
  key: 'API Key',
  secret: 'Secret Key (SK)',
  region: 'Region(区域)'
}

type Page = 'vendors' | 'display' | 'alerts' | 'about'

/* 极简线性图标(f feather 风格,stroke 跟随文字色) */
function Icon({ name }: { name: Page }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  if (name === 'vendors')
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    )
  if (name === 'display')
    return (
      <svg {...common}>
        <line x1="4" y1="8" x2="20" y2="8" />
        <circle cx="9" cy="8" r="2.2" fill="#fff" />
        <line x1="4" y1="16" x2="20" y2="16" />
        <circle cx="15" cy="16" r="2.2" fill="#fff" />
      </svg>
    )
  if (name === 'alerts')
    return (
      <svg {...common}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
    )
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="7.6" r="0.4" fill="currentColor" />
    </svg>
  )
}

/* 应用"用量表"小标志(与托盘图标同意象:缺口的圆弧) */
function Logo({ size = 64 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: 'conic-gradient(from 125deg, #4d6bfe 0 78%, #c8cfe0 78% 100%)',
        position: 'relative',
        margin: '0 auto'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: size * 0.16,
          borderRadius: size * 0.2,
          background: '#fff'
        }}
      />
    </div>
  )
}

const NAV: { id: Page; label: string }[] = [
  { id: 'vendors', label: '厂商配置' },
  { id: 'display', label: '显示' },
  { id: 'alerts', label: '提醒' },
  { id: 'about', label: '关于' }
]

export function Settings() {
  const [page, setPage] = useState<Page>('vendors')
  const [data, setData] = useState<VendorListResp | null>(null)
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [version, setVersion] = useState('')
  const [enc, setEnc] = useState(true)
  const [openVendorId, setOpenVendorId] = useState<string | null>(null)

  const loadList = (): void => {
    void window.api.getVendorList().then((d) => setData(d as VendorListResp))
  }

  useEffect(() => {
    loadList()
    void window.api.getVersion().then(setVersion)
    void window.api.encryptionAvailable().then((v) => setEnc(v))
    void window.api.getDisplay().then((d) => setDisplay(d as DisplayConfig))
  }, [])

  const patchDisplay = (patch: Partial<DisplayConfig>): void => {
    void window.api.setDisplay(patch).then((d) => setDisplay(d as DisplayConfig))
  }

  /* ── 厂商配置页:列表 + 详情两级 ── */
  const vendor = openVendorId ? data?.vendors.find((v) => v.id === openVendorId) : undefined

  let content: React.ReactElement
  if (page === 'vendors' && vendor) {
    content = (
      <VendorDetail
        vendor={vendor}
        data={data}
        onBack={() => {
          setOpenVendorId(null)
          loadList()
        }}
        onSaved={() => loadList()}
      />
    )
  } else if (page === 'vendors') {
    content = (
      <VendorListPage
        data={data}
        onOpen={(id) => {
          setOpenVendorId(id)
        }}
        version={version}
        enc={enc}
      />
    )
  } else if (page === 'display' && display) {
    content = <DisplayPage display={display} onChange={patchDisplay} />
  } else if (page === 'alerts' && display) {
    content = <AlertsPage display={display} onChange={patchDisplay} />
  } else if (page === 'about') {
    content = <AboutPage version={version} />
  } else {
    content = <div className="page" />
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-title">LLM Usage Widget</div>
        <nav>
          {NAV.map((n) => (
            <div
              key={n.id}
              className={`nav-item ${page === n.id ? 'active' : ''}`}
              onClick={() => {
                setPage(n.id)
                setOpenVendorId(null)
              }}
            >
              <Icon name={n.id} />
              <span>{n.label}</span>
            </div>
          ))}
        </nav>
      </aside>
      <main className="content">
        {!enc && page !== 'about' && (
          <div className="banner-warn">⚠ 系统加密不可用,API Key 将以明文保存在本地!</div>
        )}
        {content}
      </main>
    </div>
  )
}

/* ── 厂商配置:选择页 ── */
function VendorListPage({
  data,
  onOpen,
  version,
  enc
}: {
  data: VendorListResp | null
  onOpen(id: string): void
  version: string
  enc: boolean
}) {
  return (
    <div className="page">
      <h1>厂商配置</h1>
      <p className="desc">点击厂商进入配置页,填写后保存立即生效;每次启动会自动加载已保存的配置。</p>
      <section>
        {data?.vendors.map((v) => {
          const accs = data.accounts[v.id] ?? []
          const configured = accs.length > 0 && accs.some((a) => a.hasKey)
          return (
            <div className="vendor-row clickable" key={v.id} onClick={() => onOpen(v.id)}>
              <span className="mono" style={{ background: v.color }}>
                {v.name.charAt(0)}
              </span>
              <span className="vname">{v.name}</span>
              <span className="vkind">{v.kind === 'quota' ? '套餐' : '余额'}</span>
              <span className="vacc">{accs.length} 个账户</span>
              <span className={`badge ${configured ? 'ok' : 'todo'}`}>
                {configured ? '已配置' : '未配置'}
              </span>
              <span className="chevron">›</span>
            </div>
          )
        })}
        {data?.errors.map((e) => (
          <div className="banner-warn" key={e.file}>
            厂商定义 {e.file}: {e.message}
          </div>
        ))}
      </section>
      <section>
        <h2>高级</h2>
        <button className="ghost" onClick={() => void window.api.openVendorsDir()}>
          打开厂商配置目录(TOML 热重载)
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          用户目录中的同名厂商定义会覆盖内置预置 · v{version} · 加密{enc ? '可用' : '不可用'}
        </div>
      </section>
    </div>
  )
}

/* ── 厂商配置:详情页 ── */
function VendorDetail({
  vendor,
  data,
  onBack,
  onSaved
}: {
  vendor: VendorRow
  data: VendorListResp | null
  onBack(): void
  onSaved(): void
}) {
  const accounts = data?.accounts[vendor.id] ?? []
  const [creds, setCreds] = useState<Record<string, CredentialForm>>({})
  const [flash, setFlash] = useState('')

  useEffect(() => {
    void (async () => {
      const next: Record<string, CredentialForm> = {}
      for (const a of accounts) {
        const c = (await window.api.getCredential(vendor.id, a.id)) as CredentialForm | null
        next[a.id] = {
          name: c?.name ?? a.name,
          key: c?.key ?? '',
          secret: c?.secret ?? '',
          region: c?.region ?? ''
        }
      }
      setCreds(next)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor.id, accounts.length])

  const patchForm = (accountId: string, field: keyof CredentialForm, value: string): void => {
    setCreds((prev) => ({ ...prev, [accountId]: { ...prev[accountId], [field]: value } }))
  }

  const saveAccount = (accountId: string): void => {
    const form = creds[accountId]
    if (!form) return
    void window.api.saveCredential(vendor.id, { id: accountId, ...form }).then(() => {
      setFlash('已保存并生效')
      setTimeout(() => setFlash(''), 2000)
      onSaved()
    })
  }

  const addAccount = (): void => {
    void window.api.addAccount(vendor.id, '').then(() => onSaved())
  }

  return (
    <div className="page">
      <button className="back" onClick={onBack}>
        ‹ 返回厂商列表
      </button>
      <h1>
        <span className="mono big" style={{ background: vendor.color }}>
          {vendor.name.charAt(0)}
        </span>
        {vendor.name}
        <small>{vendor.kind === 'quota' ? '套餐用量' : '账户余额'}</small>
      </h1>
      {flash && <div className="banner-ok">{flash}</div>}

      <section>
        <h2>账户凭证</h2>
        {accounts.map((a) => {
          const form = creds[a.id] ?? { name: a.name, key: '', secret: '', region: '' }
          return (
            <div className="account-card" key={a.id}>
              <div className="acc-head">
                <strong>{a.name}</strong>
                <span className={`badge ${a.hasKey ? 'ok' : 'todo'}`}>
                  {a.hasKey ? '已配置' : '未配置'}
                </span>
              </div>
              <label>
                账户别名
                <input value={form.name} onChange={(e) => patchForm(a.id, 'name', e.target.value)} />
              </label>
              {vendor.fields.map((f) => (
                <label key={f}>
                  {FIELD_LABELS[f] ?? f}
                  <input
                    type={f === 'region' ? 'text' : 'password'}
                    value={(form as unknown as Record<string, string>)[f] ?? ''}
                    placeholder={f === 'region' ? 'cn-beijing' : ''}
                    onChange={(e) => patchForm(a.id, f as keyof CredentialForm, e.target.value)}
                  />
                  {vendor.fieldHints?.[f] && <span className="hint">{vendor.fieldHints[f]}</span>}
                </label>
              ))}
              <div className="acc-actions">
                <button className="primary" onClick={() => saveAccount(a.id)}>
                  保存
                </button>
              </div>
            </div>
          )
        })}
        <button className="ghost" onClick={addAccount}>
          ＋ 添加账户
        </button>
      </section>

      <section>
        <h2>厂商信息(来自预置定义,可在配置目录覆盖)</h2>
        <div className="row">
          <span className="k">标识</span>
          <span>{vendor.id}</span>
        </div>
        <div className="row">
          <span className="k">类型</span>
          <span>{vendor.kind === 'quota' ? '套餐额度' : '账户余额'}</span>
        </div>
        {vendor.homepage && (
          <div className="row">
            <span className="k">控制台</span>
            <span className="link" onClick={() => void window.api.openExternal(vendor.homepage!)}>
              {vendor.homepage}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}

/* ── 显示页 ── */
function DisplayPage({
  display,
  onChange
}: {
  display: DisplayConfig
  onChange(patch: Partial<DisplayConfig>): void
}) {
  return (
    <div className="page">
      <h1>显示</h1>
      <p className="desc">文字与图标永远保持不透明,透明度只作用于卡片背景,呈现悬浮效果。</p>
      <section>
        <h2>展示形式</h2>
        <div className="seg">
          <button
            className={display.mode === 'carousel' ? 'on' : ''}
            onClick={() => onChange({ mode: 'carousel' })}
          >
            轮播
            <small>逐家切换,仅已配置厂商</small>
          </button>
          <button
            className={display.mode === 'list' ? 'on' : ''}
            onClick={() => onChange({ mode: 'list' })}
          >
            列表
            <small>全部已配置厂商一屏展示</small>
          </button>
        </div>
      </section>
      <section>
        <h2>悬浮窗</h2>
        <label>
          背景不透明度:{Math.round(display.bgOpacity * 100)}%
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={display.bgOpacity}
            onChange={(e) => onChange({ bgOpacity: Number(e.target.value) })}
          />
        </label>
        <div className="check-row">
          <label className="check">
            <input
              type="checkbox"
              checked={display.alwaysOnTop}
              onChange={(e) => onChange({ alwaysOnTop: e.target.checked })}
            />
            窗口置顶
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={display.clickThrough}
              onChange={(e) => onChange({ clickThrough: e.target.checked })}
            />
            点击穿透(鼠标穿透到桌面)
          </label>
        </div>
      </section>
      <section>
        <h2>刷新与轮播</h2>
        <label>
          轮询间隔:{Math.round(display.pollIntervalMs / 1000)} 秒(余额型厂商固定 5 分钟)
          <input
            type="range"
            min={30}
            max={600}
            step={10}
            value={display.pollIntervalMs / 1000}
            onChange={(e) => onChange({ pollIntervalMs: Number(e.target.value) * 1000 })}
          />
        </label>
        <label>
          自动翻页:{display.autoCycleMs === 0 ? '关闭' : `${display.autoCycleMs / 1000} 秒`}
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={display.autoCycleMs / 1000}
            onChange={(e) => onChange({ autoCycleMs: Number(e.target.value) * 1000 })}
          />
        </label>
      </section>
    </div>
  )
}

/* ── 提醒页 ── */
function AlertsPage({
  display,
  onChange
}: {
  display: DisplayConfig
  onChange(patch: Partial<DisplayConfig>): void
}) {
  const a = display.alerts
  const set = (patch: Partial<DisplayConfig['alerts']>): void =>
    onChange({ alerts: { ...a, ...patch } })
  return (
    <div className="page">
      <h1>提醒</h1>
      <p className="desc">用量达到阈值时,悬浮窗进度条会变为对应颜色;系统通知将在后续版本提供。</p>
      <section>
        <h2>阈值(套餐型,按已用百分比)</h2>
        <label>
          预警阈值(变橙):{a.warnPct}%
          <input
            type="range"
            min={10}
            max={95}
            step={5}
            value={a.warnPct}
            onChange={(e) => set({ warnPct: Number(e.target.value) })}
          />
        </label>
        <label>
          告警阈值(变红):{a.critPct}%
          <input
            type="range"
            min={20}
            max={100}
            step={5}
            value={a.critPct}
            onChange={(e) => set({ critPct: Number(e.target.value) })}
          />
        </label>
      </section>
      <section>
        <h2>余额型</h2>
        <label>
          余额下限(低于此值提示,单位随厂商币种):{a.balanceMin}
          <input
            type="range"
            min={1}
            max={200}
            step={1}
            value={a.balanceMin}
            onChange={(e) => set({ balanceMin: Number(e.target.value) })}
          />
        </label>
      </section>
    </div>
  )
}

/* ── 关于页(布局参考 Clawd 的关于页:hero + 行式信息) ── */
function AboutPage({ version }: { version: string }) {
  const repo = 'github.com/anylink/llm-usage-widget'
  return (
    <div className="page about">
      <div className="hero">
        <Logo />
        <h1>LLM Usage Widget</h1>
        <p className="tagline">桌面悬浮的大模型用量仪表。</p>
      </div>
      <section>
        <div className="row">
          <span className="k">版本</span>
          <span>v{version}</span>
        </div>
        <div className="row">
          <span className="k">代码仓库</span>
          <span
            className="link"
            onClick={() => void window.api.openExternal('https://github.com/anylink/llm-usage-widget')}
          >
            {repo}
          </span>
        </div>
        <div className="row">
          <span className="k">开源协议</span>
          <span>MIT-3.0 · © 2026 Apanda</span>
        </div>
        <div className="row">
          <span className="k">技术栈</span>
          <span>Electron + React + TypeScript</span>
        </div>
        <div className="row">
          <span className="k">作者</span>
          <span>Apanda (anylink)</span>
        </div>
        <div className="row">
          <span className="k">参考致谢</span>
          <span>
            <span
              className="link"
              onClick={() => void window.api.openExternal('https://github.com/farion1231/cc-switch')}
            >
              CC Switch
            </span>{' '}
            ·{' '}
            <span
              className="link"
              onClick={() => void window.api.openExternal('https://github.com/rullerzhou-afk/clawd-on-desk')}
            >
              Clawd on Desk
            </span>
          </span>
        </div>
      </section>
      <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
        本项目只查询各厂商官方接口,密钥仅保存在本地并加密,无任何遥测。
      </p>
    </div>
  )
}
