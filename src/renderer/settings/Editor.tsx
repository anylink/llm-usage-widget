/* 厂商编辑器(F8):schema 驱动表单 → 测试请求 → JSON 树点选填路径 → 存为用户 TOML */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UsageEntry, VendorDef } from '@shared/types'

interface WindowForm {
  label: string
  percentPath: string
  scale: string
  resetPath: string
}

interface EditorForm {
  id: string
  name: string
  kind: 'quota' | 'balance'
  color: string
  authStyle: 'bearer' | 'raw' | 'header'
  headerName: string
  fields: string[]
  method: 'GET' | 'POST'
  url: string
  timeoutMs: number
  checkPath: string
  checkEquals: string
  checkErrorPath: string
  valuePath: string
  valueScale: string
  unit: string
  windows: WindowForm[]
  testKey: string
}

const blankForm = (): EditorForm => ({
  id: '',
  name: '',
  kind: 'quota',
  color: '#4d6bfe',
  authStyle: 'bearer',
  headerName: '',
  fields: ['key'],
  method: 'GET',
  url: '',
  timeoutMs: 15000,
  checkPath: '',
  checkEquals: '',
  checkErrorPath: '',
  valuePath: '',
  valueScale: '',
  unit: 'USD',
  windows: [{ label: '5h', percentPath: '', scale: '', resetPath: '' }],
  testKey: ''
})

function formToDef(f: EditorForm): VendorDef {
  const def: VendorDef = {
    id: f.id.trim(),
    name: f.name.trim(),
    kind: f.kind,
    color: f.color,
    auth: {
      style: f.authStyle,
      ...(f.authStyle === 'header' && f.headerName.trim() ? { headerName: f.headerName.trim() } : {}),
      fields: f.fields
    },
    requests: [
      {
        method: f.method,
        url: f.url.trim(),
        timeoutMs: f.timeoutMs || undefined
      }
    ],
    parse:
      f.kind === 'balance'
        ? {
            value: { path: f.valuePath.trim(), ...(f.valueScale ? { scale: Number(f.valueScale) } : {}) },
            ...(f.unit.trim() ? { unit: f.unit.trim() } : {})
          }
        : {
            windows: f.windows
              .filter((w) => w.percentPath.trim())
              .map((w) => ({
                label: w.label.trim() || '5h',
                percent: { path: w.percentPath.trim(), ...(w.scale ? { scale: Number(w.scale) } : {}) },
                ...(w.resetPath.trim() ? { reset: w.resetPath.trim() } : {})
              }))
          }
  }
  if (f.checkPath.trim()) {
    def.check = {
      path: f.checkPath.trim(),
      equals: f.checkEquals,
      ...(f.checkErrorPath.trim() ? { errorMessagePath: f.checkErrorPath.trim() } : {})
    }
  }
  return def
}

function defToForm(def: VendorDef): EditorForm {
  const f = blankForm()
  f.id = def.id
  f.name = def.name
  f.kind = def.kind
  f.color = def.color ?? '#4d6bfe'
  f.authStyle = def.auth.style === 'raw' ? 'raw' : def.auth.style === 'header' ? 'header' : 'bearer'
  f.headerName = def.auth.headerName ?? ''
  f.fields = def.auth.fields.length ? [...def.auth.fields] : ['key']
  const r0 = def.requests[0]
  f.method = r0?.method ?? 'GET'
  f.url = r0?.url ?? ''
  f.timeoutMs = r0?.timeoutMs ?? 15000
  if (def.check) {
    f.checkPath = def.check.path
    f.checkEquals = String(def.check.equals ?? '')
    f.checkErrorPath = def.check.errorMessagePath ?? ''
  }
  if (def.kind === 'balance' && def.parse.value) {
    f.valuePath = def.parse.value.path
    f.valueScale = def.parse.value.scale ? String(def.parse.value.scale) : ''
    f.unit = typeof def.parse.unit === 'string' ? def.parse.unit : 'USD'
  }
  if (def.kind === 'quota') {
    const wins = (def.parse.windows ?? [])
      .filter((w) => w.percent)
      .map((w) => ({
        label: w.label,
        percentPath: w.percent!.path,
        scale: w.percent!.scale ? String(w.percent!.scale) : '',
        resetPath: w.reset ?? ''
      }))
    if (wins.length) f.windows = wins
  }
  return f
}

function buildPath(base: string, key: string | number): string {
  if (base === '') return typeof key === 'number' ? `[${key}]` : key
  return typeof key === 'number' ? `${base}[${key}]` : `${base}.${key}`
}

/* JSON 树:叶子可点选,把点路径回填给当前选中目标;forceOpen = 选取时全展开 */
function JsonNode({
  name,
  path,
  value,
  depth,
  forceOpen,
  onPick
}: {
  name: string
  path: string
  value: unknown
  depth: number
  forceOpen?: boolean
  onPick(p: string): void
}) {
  const [open, setOpen] = useState(depth < 1)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])
  const isLeaf = value === null || typeof value !== 'object'
  return (
    <div className="jt-node">
      <div
        className="jt-row"
        onClick={() => (isLeaf ? onPick(path) : setOpen(!open))}
        title={isLeaf ? path : undefined}
      >
        {isLeaf ? (
          <>
            <span className="jt-key">{name}</span>
            <span className="jt-val">{String(value)}</span>
            <button
              className="jt-pick"
              onClick={(e) => {
                e.stopPropagation()
                onPick(path)
              }}
            >
              ↩
            </button>
          </>
        ) : (
          <>
            <span className="jt-caret">{open ? '▾' : '▸'}</span>
            <span className="jt-key">{name}</span>
            <span className="jt-type">{Array.isArray(value) ? `[] ×${value.length}` : '{ }'}</span>
          </>
        )}
      </div>
      {!isLeaf && open && (
        <div className="jt-children">
          {Array.isArray(value)
            ? value.map((v, i) => (
                <JsonNode
                  key={i}
                  name={`[${i}]`}
                  path={buildPath(path, i)}
                  value={v}
                  depth={depth + 1}
                  forceOpen={forceOpen}
                  onPick={onPick}
                />
              ))
            : Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                <JsonNode
                  key={k}
                  name={k}
                  path={buildPath(path, k)}
                  value={v}
                  depth={depth + 1}
                  forceOpen={forceOpen}
                  onPick={onPick}
                />
              ))}
        </div>
      )}
    </div>
  )
}

/** 目标字段旁的"选取"按钮:激活后点 JSON 叶子即回填 */
function PickBtn({
  active,
  onClick,
  title
}: {
  active: boolean
  onClick(): void
  title?: string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className={`pick-target ${active ? 'active' : ''}`}
      title={title ?? t('settings.editor.pick')}
      onClick={onClick}
    >
      ⌖
    </button>
  )
}

export function EditorPage({
  initialId,
  onBack,
  onSaved
}: {
  initialId: string | null
  onBack(): void
  onSaved(): void
}) {
  const { t } = useTranslation()
  const S = 'settings.editor'
  const [f, setF] = useState<EditorForm>(blankForm)
  const [testResult, setTestResult] = useState<{
    entry: UsageEntry
    bodyText?: string
    httpStatus?: number
  } | null>(null)
  /** 测试通过时的表单快照:表单再变更即视为未测试(设计:测试通过才允许保存) */
  const [testedSnapshot, setTestedSnapshot] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [pickTarget, setPickTarget] = useState<string | null>(null)
  const [flash, setFlash] = useState('')

  useEffect(() => {
    if (!initialId) return
    void (async () => {
      const def = (await window.api.getVendorDef(initialId)) as VendorDef | null
      if (def) {
        setF(defToForm(def))
        setTestResult(null)
      }
    })()
  }, [initialId])

  const set = (patch: Partial<EditorForm>): void => setF((prev) => ({ ...prev, ...patch }))
  const setWindow = (i: number, patch: Partial<WindowForm>): void =>
    setF((prev) => ({ ...prev, windows: prev.windows.map((w, idx) => (idx === i ? { ...w, ...patch } : w)) }))

  /** JSON 树点选 → 回填当前目标路径 */
  const pick = (path: string): void => {
    if (!pickTarget) return
    if (pickTarget === 'value') set({ valuePath: path })
    else if (pickTarget === 'check') set({ checkPath: path })
    else if (pickTarget.startsWith('win:')) {
      const [, iStr, field] = pickTarget.split(':')
      setWindow(Number(iStr), { [field]: path } as Partial<WindowForm>)
    }
    setPickTarget(null)
  }

  const def = useMemo(() => formToDef(f), [f])
  const tested = testResult?.entry.status === 'ok' && testedSnapshot === JSON.stringify(def)
  const parsed = useMemo(() => {
    if (!testResult?.bodyText) return null
    try {
      return JSON.parse(testResult.bodyText) as unknown
    } catch {
      return null
    }
  }, [testResult])

  const runTest = async (): Promise<void> => {
    setTesting(true)
    try {
      const r = (await window.api.testVendor(def, { key: f.testKey })) as {
        entry: UsageEntry
        bodyText?: string
        httpStatus?: number
      }
      setTestResult(r)
      setTestedSnapshot(JSON.stringify(def))
    } finally {
      setTesting(false)
    }
  }

  const save = async (): Promise<void> => {
    const r = await window.api.saveVendor(def)
    if (r.ok) {
      setFlash(t(`${S}.savedOk`))
      onSaved()
      onBack()
    } else {
      setFlash(r.error ?? 'error')
    }
  }

  const statusTextKey: Record<string, string> = {
    ok: t(`${S}.resultOk`),
    auth: t('status.auth'),
    http: testResult?.entry.message ?? t('status.http'),
    parse: t(`${S}.resultFail`),
    network: t('status.network')
  }

  return (
    <div className="page">
      <button className="back" onClick={onBack}>
        {t(`${S}.back`)}
      </button>
      <h1>{t(`${S}.title`)}</h1>
      {flash && <div className="banner-ok">{flash}</div>}

      <section>
        <h2>{t(`${S}.basic`)}</h2>
        <div className="editor-grid">
          <label>
            {t(`${S}.id`)}
            <input value={f.id} placeholder="my-vendor" onChange={(e) => set({ id: e.target.value })} />
          </label>
          <label>
            {t(`${S}.name`)}
            <input value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label>
            {t(`${S}.kind`)}
            <select value={f.kind} onChange={(e) => set({ kind: e.target.value as 'quota' | 'balance' })}>
              <option value="quota">{t('settings.vendors.quota')}</option>
              <option value="balance">{t('settings.vendors.balance')}</option>
            </select>
          </label>
          <label>
            {t(`${S}.color`)}
            <input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} />
          </label>
        </div>
      </section>

      <section>
        <h2>{t(`${S}.auth`)}</h2>
        <div className="editor-grid">
          <label>
            {t(`${S}.authStyle`)}
            <select value={f.authStyle} onChange={(e) => set({ authStyle: e.target.value as EditorForm['authStyle'] })}>
              <option value="bearer">Bearer</option>
              <option value="raw">{t(`${S}.authRaw`)}</option>
              <option value="header">{t(`${S}.authHeader`)}</option>
            </select>
          </label>
          {f.authStyle === 'header' && (
            <label>
              {t(`${S}.headerName`)}
              <input value={f.headerName} placeholder="X-Api-Key" onChange={(e) => set({ headerName: e.target.value })} />
            </label>
          )}
        </div>
        <div className="check-row">
          {['key', 'secret', 'region'].map((field) => (
            <label className="check" key={field}>
              <input
                type="checkbox"
                checked={f.fields.includes(field)}
                onChange={(e) =>
                  set({ fields: e.target.checked ? [...f.fields, field] : f.fields.filter((x) => x !== field) })
                }
              />
              {t(`settings.vendors.field${field.charAt(0).toUpperCase()}${field.slice(1)}`)}
            </label>
          ))}
        </div>
      </section>

      <section>
        <h2>{t(`${S}.request`)}</h2>
        <div className="editor-grid">
          <label>
            {t(`${S}.method`)}
            <select value={f.method} onChange={(e) => set({ method: e.target.value as 'GET' | 'POST' })}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </label>
          <label>
            {t(`${S}.timeout`)}
            <input
              type="number"
              value={f.timeoutMs}
              onChange={(e) => set({ timeoutMs: Number(e.target.value) })}
            />
          </label>
        </div>
        <label>
          {t(`${S}.url`)}
          <input value={f.url} placeholder="https://api.example.com/v1/usage" onChange={(e) => set({ url: e.target.value })} />
        </label>
      </section>

      <section>
        <h2>{t(`${S}.check`)}</h2>
        <div className="editor-grid">
          <label>
            {t(`${S}.checkPath`)} <PickBtn active={pickTarget === 'check'} onClick={() => setPickTarget('check')} />
            <input value={f.checkPath} onChange={(e) => set({ checkPath: e.target.value })} />
          </label>
          <label>
            {t(`${S}.checkEquals`)}
            <input value={f.checkEquals} placeholder="true" onChange={(e) => set({ checkEquals: e.target.value })} />
          </label>
          <label>
            {t(`${S}.checkErrorPath`)}
            <input value={f.checkErrorPath} onChange={(e) => set({ checkErrorPath: e.target.value })} />
          </label>
        </div>
      </section>

      <section>
        <h2>{t(`${S}.parse`)}</h2>
        {f.kind === 'balance' ? (
          <div className="editor-grid">
            <label>
              {t(`${S}.valuePath`)}{' '}
              <PickBtn active={pickTarget === 'value'} onClick={() => setPickTarget('value')} />
              <input value={f.valuePath} onChange={(e) => set({ valuePath: e.target.value })} />
            </label>
            <label>
              {t(`${S}.scale`)}
              <input value={f.valueScale} placeholder="1" onChange={(e) => set({ valueScale: e.target.value })} />
            </label>
            <label>
              {t(`${S}.unit`)}
              <input value={f.unit} placeholder="USD" onChange={(e) => set({ unit: e.target.value })} />
            </label>
          </div>
        ) : (
          <>
            {f.windows.map((w, i) => (
              <div className="win-editor" key={i}>
                <div className="editor-grid">
                  <label>
                    {t(`${S}.label`)}
                    <input value={w.label} placeholder="5h" onChange={(e) => setWindow(i, { label: e.target.value })} />
                  </label>
                  <label>
                    {t(`${S}.scale`)}
                    <input value={w.scale} placeholder="1" onChange={(e) => setWindow(i, { scale: e.target.value })} />
                  </label>
                </div>
                <label>
                  {t(`${S}.percentPath`)}{' '}
                  <PickBtn active={pickTarget === `win:${i}:percentPath`} onClick={() => setPickTarget(`win:${i}:percentPath`)} />
                  <input value={w.percentPath} onChange={(e) => setWindow(i, { percentPath: e.target.value })} />
                </label>
                <label>
                  {t(`${S}.resetPath`)}{' '}
                  <PickBtn active={pickTarget === `win:${i}:resetPath`} onClick={() => setPickTarget(`win:${i}:resetPath`)} />
                  <input value={w.resetPath} onChange={(e) => setWindow(i, { resetPath: e.target.value })} />
                </label>
                {f.windows.length > 1 && (
                  <button
                    className="ghost"
                    onClick={() => setF((prev) => ({ ...prev, windows: prev.windows.filter((_, idx) => idx !== i) }))}
                  >
                    {t(`${S}.removeWindow`)}
                  </button>
                )}
              </div>
            ))}
            <button
              className="ghost"
              onClick={() =>
                setF((prev) => ({ ...prev, windows: [...prev.windows, { label: '', percentPath: '', scale: '', resetPath: '' }] }))
              }
            >
              {t(`${S}.addWindow`)}
            </button>
          </>
        )}
      </section>

      <section>
        <h2>{t(`${S}.test`)}</h2>
        <div className="editor-grid">
          <label>
            {t(`${S}.testKey`)}
            <input
              type="password"
              value={f.testKey}
              onChange={(e) => set({ testKey: e.target.value })}
            />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button className="primary" disabled={testing || !f.url.trim()} onClick={() => void runTest()}>
              {testing ? t(`${S}.testing`) : t(`${S}.runTest`)}
            </button>
          </div>
        </div>
        {testResult && (
          <div className={`banner-ok ${tested ? '' : 'banner-warn'}`} style={{ marginTop: 8 }}>
            HTTP {testResult.httpStatus ?? '-'} · {statusTextKey[testResult.entry.status] ?? testResult.entry.status}
            {testResult.entry.status === 'ok' && f.kind === 'quota'
              ? ` · ${testResult.entry.windows.map((x) => `${x.label} ${x.utilization}%`).join(' / ')}`
              : ''}
            {testResult.entry.status === 'ok' && f.kind === 'balance' ? ` · ${testResult.entry.value} ${testResult.entry.unit}` : ''}
          </div>
        )}
      </section>

      {testResult?.bodyText && (
        <section>
          <h2>{t(`${S}.responseTree`)}</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            {pickTarget ? t(`${S}.pickActive`) : t(`${S}.pickIdle`)}
          </p>
          <div className="jt">
            {parsed !== null ? (
              <JsonNode name="root" path="" value={parsed} depth={0} forceOpen={!!pickTarget} onPick={pick} />
            ) : (
              <span className="jt-val">{testResult.bodyText.slice(0, 400)}</span>
            )}
          </div>
        </section>
      )}

      <section>
        <button className="primary" disabled={!tested} onClick={() => void save()}>
          {t(`${S}.save`)}
        </button>
        <p className="hint" style={{ marginTop: 8 }}>
          {t(`${S}.saveHint`)}
        </p>
      </section>
    </div>
  )
}
