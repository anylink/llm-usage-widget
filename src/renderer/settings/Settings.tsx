/* 设置窗口:左侧导航 + 右侧内容(布局参考 Clawd on Desk 的设置框架) */
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DisplayConfig, UpdateState } from '@shared/types'
import { i18n } from './i18n'
import { resolveLocale } from '@shared/i18n'

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

/* 凭证字段 → i18n key(文案在 locales) */
const FIELD_KEYS: Record<string, string> = {
  key: 'fieldKey',
  secret: 'fieldSecret',
  region: 'fieldRegion'
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

const NAV: { id: Page }[] = [{ id: 'vendors' }, { id: 'display' }, { id: 'alerts' }, { id: 'about' }]

export function Settings() {
  const { t } = useTranslation()
  const [page, setPage] = useState<Page>('vendors')
  const [data, setData] = useState<VendorListResp | null>(null)
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [version, setVersion] = useState('')
  const [enc, setEnc] = useState(true)
  const [openVendorId, setOpenVendorId] = useState<string | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)

  const loadList = (): void => {
    void window.api.getVendorList().then((d) => setData(d as VendorListResp))
  }

  useEffect(() => {
    loadList()
    void window.api.getVersion().then(setVersion)
    void window.api.encryptionAvailable().then((v) => setEnc(v))
    void window.api.getDisplay().then((d) => {
      setDisplay(d as DisplayConfig)
      const cfg = d as DisplayConfig
      void i18n.changeLanguage(resolveLocale(cfg.locale, navigator.language))
      document.title = i18n.t('app.settingsTitle')
    })
    window.api.onDisplayChanged((d) => {
      setDisplay(d as DisplayConfig)
      const cfg = d as DisplayConfig
      void i18n.changeLanguage(resolveLocale(cfg.locale, navigator.language)).then(() => {
        document.title = i18n.t('app.settingsTitle')
      })
    })
    window.api.onUpdateStatus((s) => setUpdateState(s as UpdateState))
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
    content = <AboutPage version={version} updateState={updateState} />
  } else {
    content = <div className="page" />
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-title">{t('app.name')}</div>
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
              <span>{t(`settings.nav.${n.id}`)}</span>
            </div>
          ))}
        </nav>
      </aside>
      <main className="content">
        {!enc && page !== 'about' && <div className="banner-warn">{t('settings.encryptionWarn')}</div>}
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
  const { t } = useTranslation()
  const S = 'settings.vendors'
  return (
    <div className="page">
      <h1>{t(`${S}.title`)}</h1>
      <p className="desc">{t(`${S}.desc`)}</p>
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
              <span className="vkind">{v.kind === 'quota' ? t(`${S}.quota`) : t(`${S}.balance`)}</span>
              <span className="vacc">{t(`${S}.accountsCount`, { count: accs.length })}</span>
              <span className={`badge ${configured ? 'ok' : 'todo'}`}>
                {configured ? t(`${S}.configured`) : t(`${S}.notConfigured`)}
              </span>
              <span className="chevron">›</span>
            </div>
          )
        })}
        {data?.errors.map((e) => (
          <div className="banner-warn" key={e.file}>
            {t(`${S}.defError`, { file: e.file, message: e.message })}
          </div>
        ))}
      </section>
      <section>
        <h2>{t(`${S}.advanced`)}</h2>
        <button className="ghost" onClick={() => void window.api.openVendorsDir()}>
          {t(`${S}.openVendorsDir`)}
        </button>
        <div className="hint" style={{ marginTop: 8 }}>
          {t(`${S}.vendorsHint`, {
            version,
            enc: enc ? t(`${S}.encAvailable`) : t(`${S}.encUnavailable`)
          })}
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
  const { t } = useTranslation()
  const S = 'settings.vendors'
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
      setFlash(t(`${S}.saved`))
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
        {t(`${S}.back`)}
      </button>
      <h1>
        <span className="mono big" style={{ background: vendor.color }}>
          {vendor.name.charAt(0)}
        </span>
        {vendor.name}
        <small>{vendor.kind === 'quota' ? t(`${S}.quotaUsage`) : t(`${S}.balanceUsage`)}</small>
      </h1>
      {flash && <div className="banner-ok">{flash}</div>}

      <section>
        <h2>{t(`${S}.credentials`)}</h2>
        {accounts.map((a) => {
          const form = creds[a.id] ?? { name: a.name, key: '', secret: '', region: '' }
          return (
            <div className="account-card" key={a.id}>
              <div className="acc-head">
                <strong>{a.name}</strong>
                <span className={`badge ${a.hasKey ? 'ok' : 'todo'}`}>
                  {a.hasKey ? t(`${S}.configured`) : t(`${S}.notConfigured`)}
                </span>
              </div>
              <label>
                {t(`${S}.accountAlias`)}
                <input value={form.name} onChange={(e) => patchForm(a.id, 'name', e.target.value)} />
              </label>
              {vendor.fields.map((f) => (
                <label key={f}>
                  {t(`${S}.${FIELD_KEYS[f] ?? f}`)}
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
                  {t(`${S}.save`)}
                </button>
              </div>
            </div>
          )
        })}
        <button className="ghost" onClick={addAccount}>
          {t(`${S}.addAccount`)}
        </button>
      </section>

      <section>
        <h2>{t(`${S}.vendorInfo`)}</h2>
        <div className="row">
          <span className="k">{t(`${S}.id`)}</span>
          <span>{vendor.id}</span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.type`)}</span>
          <span>{vendor.kind === 'quota' ? t(`${S}.typeQuota`) : t(`${S}.typeBalance`)}</span>
        </div>
        {vendor.homepage && (
          <div className="row">
            <span className="k">{t(`${S}.console`)}</span>
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
  const { t } = useTranslation()
  const S = 'settings.display'
  const LOCALE_LABELS: Record<DisplayConfig['locale'], string> = {
    auto: t('lang.followSystem'),
    'zh-CN': '简体中文',
    en: 'English'
  }
  return (
    <div className="page">
      <h1>{t(`${S}.title`)}</h1>
      <p className="desc">{t(`${S}.desc`)}</p>
      <section>
        <h2>{t('lang.label')}</h2>
        <div className="seg">
          {(['auto', 'zh-CN', 'en'] as const).map((loc) => (
            <button key={loc} className={display.locale === loc ? 'on' : ''} onClick={() => onChange({ locale: loc })}>
              {LOCALE_LABELS[loc]}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>{t(`${S}.form`)}</h2>
        <div className="seg">
          <button
            className={display.mode === 'carousel' ? 'on' : ''}
            onClick={() => onChange({ mode: 'carousel' })}
          >
            {t(`${S}.carousel`)}
            <small>{t(`${S}.carouselHint`)}</small>
          </button>
          <button className={display.mode === 'list' ? 'on' : ''} onClick={() => onChange({ mode: 'list' })}>
            {t(`${S}.list`)}
            <small>{t(`${S}.listHint`)}</small>
          </button>
        </div>
      </section>
      <section>
        <h2>{t(`${S}.widget`)}</h2>
        <label>
          {display.bgOpacity === 0
            ? t(`${S}.bgOpacity`, { pct: Math.round(display.bgOpacity * 100) }) + ' ' + t(`${S}.bgNone`)
            : t(`${S}.bgOpacity`, { pct: Math.round(display.bgOpacity * 100) }) + ' ' + t(`${S}.bgKeepOpaque`)}
          <input
            type="range"
            min={0}
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
            {t(`${S}.alwaysOnTop`)}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={display.clickThrough}
              onChange={(e) => onChange({ clickThrough: e.target.checked })}
            />
            {t(`${S}.clickThrough`)}
          </label>
        </div>
      </section>
      <section>
        <h2>{t(`${S}.refreshCycle`)}</h2>
        <label>
          {t(`${S}.pollInterval`, { sec: Math.round(display.pollIntervalMs / 1000) })}
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
          {display.autoCycleMs === 0 ? t(`${S}.autoCycleOff`) : t(`${S}.autoCycle`, { sec: display.autoCycleMs / 1000 })}
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
  const { t } = useTranslation()
  const S = 'settings.alertsPage'
  return (
    <div className="page">
      <h1>{t(`${S}.title`)}</h1>
      <p className="desc">{t(`${S}.desc`)}</p>
      <section>
        <h2>{t(`${S}.ways`)}</h2>
        <div className="check-row">
          <label className="check">
            <input
              type="checkbox"
              checked={a.bubble}
              onChange={(e) => set({ bubble: e.target.checked })}
            />
            {t(`${S}.bubble`)}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={a.notify}
              onChange={(e) => set({ notify: e.target.checked })}
            />
            {t(`${S}.notify`)}
          </label>
        </div>
      </section>
      <section>
        <h2>{t(`${S}.thresholds`)}</h2>
        <label>
          {t(`${S}.warn`, { pct: a.warnPct })}
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
          {t(`${S}.crit`, { pct: a.critPct })}
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
        <h2>{t(`${S}.balance`)}</h2>
        <label>
          {t(`${S}.balanceMin`, { min: a.balanceMin })}
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

/* ── 关于页(布局参考 Clawd 的关于页:hero + 行式信息;含更新区) ── */
function AboutPage({ version, updateState }: { version: string; updateState: UpdateState | null }) {
  const { t } = useTranslation()
  const S = 'settings.about'
  const U = 'updater'
  const repo = 'github.com/anylink/llm-usage-widget'
  const st = updateState?.status ?? 'idle'
  const updateLine = (() => {
    switch (st) {
      case 'dev':
        return t(`${U}.devOnly`)
      case 'checking':
        return t(`${U}.checking`)
      case 'downloading':
        return t(`${U}.downloading`, { version: updateState?.version ?? '' })
      case 'downloaded':
        return t(`${U}.downloaded`, { version: updateState?.version ?? '' })
      case 'latest':
        return t(`${U}.latest`)
      case 'error':
        return t(`${U}.error`, { message: updateState?.message ?? '' })
      default:
        return ''
    }
  })()
  return (
    <div className="page about">
      <div className="hero">
        <Logo />
        <h1>LLM Usage Widget</h1>
        <p className="tagline">{t(`${S}.tagline`)}</p>
      </div>
      <section>
        <div className="row">
          <span className="k">{t(`${S}.version`)}</span>
          <span>v{version}</span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.repo`)}</span>
          <span
            className="link"
            onClick={() => void window.api.openExternal('https://github.com/anylink/llm-usage-widget')}
          >
            {repo}
          </span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.license`)}</span>
          <span>{t(`${S}.licenseValue`)}</span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.techStack`)}</span>
          <span>Electron + React + TypeScript</span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.author`)}</span>
          <span>Apanda (anylink)</span>
        </div>
        <div className="row">
          <span className="k">{t(`${S}.credits`)}</span>
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
      <section>
        <h2>{t(`${U}.section`)}</h2>
        <div className="check-row" style={{ alignItems: 'center' }}>
          <button className="ghost" onClick={() => void window.api.checkUpdate()}>
            {st === 'downloaded' ? t(`${U}.restartInstall`) : t(`${U}.checkNow`)}
          </button>
          <span className="hint" style={{ marginTop: 0 }}>
            {updateLine}
          </span>
        </div>
      </section>
      <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
        {t(`${S}.privacy`)}
      </p>
    </div>
  )
}
