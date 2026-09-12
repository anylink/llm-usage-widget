/* 设置窗口:两级页面(厂商选择页 → 厂商配置页),对齐 CC Switch 的配置动线
 * 启动即读配置文件;未配置厂商可在配置页补配,保存写回 accounts.json 并热重载 */
import { useEffect, useState } from 'react'
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

type View = { page: 'list' } | { page: 'vendor'; vendorId: string }

export function Settings() {
  const [data, setData] = useState<VendorListResp | null>(null)
  const [view, setView] = useState<View>({ page: 'list' })
  const [display, setDisplay] = useState<DisplayConfig | null>(null)
  const [version, setVersion] = useState('')
  const [enc, setEnc] = useState(true)
  const [creds, setCreds] = useState<Record<string, CredentialForm>>({})
  const [flash, setFlash] = useState('')

  const loadList = (): void => {
    void window.api.getVendorList().then((d) => setData(d as VendorListResp))
  }

  useEffect(() => {
    loadList()
    void window.api.getVersion().then(setVersion)
    void window.api.encryptionAvailable().then((v) => setEnc(v))
    void window.api.getDisplay().then((d) => setDisplay(d as DisplayConfig))
  }, [])

  const openVendor = (vendorId: string): void => {
    setView({ page: 'vendor', vendorId })
    void (async () => {
      const accounts = data?.accounts[vendorId] ?? []
      const next: Record<string, CredentialForm> = {}
      for (const a of accounts) {
        const c = (await window.api.getCredential(vendorId, a.id)) as CredentialForm | null
        next[a.id] = {
          name: c?.name ?? a.name,
          key: c?.key ?? '',
          secret: c?.secret ?? '',
          region: c?.region ?? ''
        }
      }
      setCreds(next)
    })()
  }

  const patchForm = (accountId: string, field: keyof CredentialForm, value: string): void => {
    setCreds((prev) => ({ ...prev, [accountId]: { ...prev[accountId], [field]: value } }))
  }

  const saveAccount = (vendorId: string, accountId: string): void => {
    const form = creds[accountId]
    if (!form) return
    void window.api.saveCredential(vendorId, { id: accountId, ...form }).then(() => {
      setFlash('已保存并生效')
      setTimeout(() => setFlash(''), 2000)
      loadList()
    })
  }

  const addAccount = (vendorId: string): void => {
    void window.api.addAccount(vendorId, '').then(() => {
      loadList()
      // 重新打开该厂商页以加载新账户
      setTimeout(() => openVendor(vendorId), 100)
    })
  }

  const setBgOpacity = (v: number): void => {
    setDisplay((prev) => (prev ? { ...prev, bgOpacity: v } : prev))
    void window.api.setDisplay({ bgOpacity: v })
  }

  const vendor =
    view.page === 'vendor' ? data?.vendors.find((v) => v.id === view.vendorId) : undefined

  /* ── 厂商配置页 ── */
  if (view.page === 'vendor' && vendor) {
    const accounts = data?.accounts[vendor.id] ?? []
    return (
      <div className="page">
        <button className="back" onClick={() => setView({ page: 'list' })}>
          ‹ 返回厂商列表
        </button>
        <h1>
          <span className="mono big" style={{ background: vendor.color }}>
            {vendor.name.charAt(0)}
          </span>
          {vendor.name}
          <small>{vendor.kind === 'quota' ? '套餐用量' : '账户余额'}</small>
        </h1>
        {flash && <div className="saved">{flash}</div>}
        {!enc && <div className="warn">⚠ 系统加密不可用,Key 将以明文保存在本地!</div>}

        <section>
          <h2>账户凭证</h2>
          {accounts.map((a) => {
            const form = creds[a.id] ?? { name: a.name, key: '', secret: '', region: '' }
            return (
              <div className="account-card" key={a.id}>
                <div className="acc-head">
                  <strong>{a.name}</strong>
                  <span className="badge">{a.hasKey ? '已配置' : '未配置'}</span>
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
                  <button className="primary" onClick={() => saveAccount(vendor.id, a.id)}>
                    保存
                  </button>
                </div>
              </div>
            )
          })}
          <button className="ghost" onClick={() => addAccount(vendor.id)}>
            ＋ 添加账户
          </button>
        </section>

        <section>
          <h2>厂商信息(来自预置定义,可在配置目录改 TOML)</h2>
          <div className="meta">
            <div>标识: {vendor.id}</div>
            <div>类型: {vendor.kind === 'quota' ? '套餐额度' : '账户余额'}</div>
            {vendor.homepage && <div>控制台: {vendor.homepage}</div>}
          </div>
        </section>
      </div>
    )
  }

  /* ── 厂商选择页(默认) ── */
  return (
    <div className="page">
      <h1>
        LLM Usage Widget 设置 <small>v{version}</small>
      </h1>
      {!enc && <div className="warn">⚠ 系统加密不可用,API Key 将以明文保存在本地!</div>}

      <section>
        <h2>选择厂商进行配置</h2>
        {data?.vendors.map((v) => {
          const accs = data.accounts[v.id] ?? []
          const configured = accs.length > 0 && accs.some((a) => a.hasKey)
          return (
            <div className="vendor-row clickable" key={v.id} onClick={() => openVendor(v.id)}>
              <span className="mono" style={{ background: v.color }}>
                {v.name.charAt(0)}
              </span>
              <span className="vname">{v.name}</span>
              <span className="vkind">{v.kind === 'quota' ? '套餐' : '余额'}</span>
              <span className="vacc">
                {accs.length} 个账户
              </span>
              <span className={`badge ${configured ? 'ok' : 'todo'}`}>
                {configured ? '已配置' : '未配置'}
              </span>
            </div>
          )
        })}
        {data?.errors.map((e) => (
          <div className="warn" key={e.file}>
            厂商定义 {e.file}: {e.message}
          </div>
        ))}
      </section>

      <section>
        <h2>显示</h2>
        <label>
          背景不透明度:{display ? Math.round(display.bgOpacity * 100) : 90}%
          (文字与图标保持不透明)
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={display?.bgOpacity ?? 0.9}
            onChange={(e) => setBgOpacity(Number(e.target.value))}
          />
        </label>
      </section>

      <section>
        <h2>高级</h2>
        <button className="ghost" onClick={() => void window.api.openVendorsDir()}>
          打开厂商配置目录(TOML 热重载)
        </button>
      </section>
    </div>
  )
}
