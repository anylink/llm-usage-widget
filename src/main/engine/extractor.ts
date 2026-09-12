/* JSON 路径提取 + 安全算术表达式求值(无 eval) */

type Json = unknown

/** 点路径取值:"a.b[0].c";任一环节缺失返回 undefined */
export function getPath(root: Json, path: string): Json {
  if (!path) return undefined
  let cur: Json = root
  const parts = path.split('.')
  for (const part of parts) {
    const m = part.match(/^(\w+)(\[(\d+)\])?$/)
    if (!m) return undefined
    if (typeof cur !== 'object' || cur === null) return undefined
    const obj = cur as Record<string, Json>
    cur = obj[m[1]]
    if (m[2] !== undefined) {
      const idx = Number(m[3])
      if (!Array.isArray(cur)) return undefined
      cur = cur[idx]
    }
    if (cur === undefined) return undefined
  }
  return cur
}

export function asNumber(v: Json): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return undefined
}

/**
 * 重置时间 → epoch 秒。自适应:秒(≤1e12)/毫秒(>1e12)/ISO8601 字符串/数字字符串。
 * 0、负数与明显非法值返回 undefined(CC Switch extract_reset_time 同款语义)。
 */
export function toEpochSeconds(v: Json): number | undefined {
  if (typeof v === 'string') {
    const s = v.trim()
    if (/^-?\d+(\.\d+)?$/.test(s)) return toEpochSeconds(Number(s))
    const t = Date.parse(s)
    return Number.isFinite(t) ? Math.floor(t / 1000) : undefined
  }
  const n = asNumber(v)
  if (n === undefined || n <= 0) return undefined
  if (n < 1e12) return Math.floor(n) // 秒
  return Math.floor(n / 1000) // 毫秒
}

/* ── 安全表达式:数字 + 标识符(fields 中给出)+ + - * / ( ) ── */

interface Token {
  t: 'num' | 'id' | 'op' | 'lp' | 'rp'
  v: string
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      tokens.push({ t: 'num', v: expr.slice(i, j) })
      i = j
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++
      tokens.push({ t: 'id', v: expr.slice(i, j) })
      i = j
    } else if ('+-*/'.includes(c)) {
      tokens.push({ t: 'op', v: c })
      i++
    } else if (c === '(') {
      tokens.push({ t: 'lp', v: c })
      i++
    } else if (c === ')') {
      tokens.push({ t: 'rp', v: c })
      i++
    } else {
      throw new Error(`表达式含非法字符: ${c}`)
    }
  }
  return tokens
}

/** 递归下降求值:expr 文法 → factor(/ mul)(+|- add) */
function evalTokens(tokens: Token[], vars: Record<string, number>): number {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function factor(): number {
    const tk = next()
    if (!tk) throw new Error('表达式意外结束')
    if (tk.t === 'num') return Number(tk.v)
    if (tk.t === 'id') {
      if (!(tk.v in vars)) throw new Error(`未知字段: ${tk.v}`)
      return vars[tk.v]
    }
    if (tk.t === 'lp') {
      const v = addSub()
      if (!peek() || peek().t !== 'rp') throw new Error('缺少右括号')
      next()
      return v
    }
    throw new Error(`非法记号: ${tk.v}`)
  }
  function mulDiv(): number {
    let v = factor()
    while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v
      const r = factor()
      if (op === '/' && r === 0) throw new Error('除零')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  function addSub(): number {
    let v = mulDiv()
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v
      const r = mulDiv()
      v = op === '+' ? v + r : v - r
    }
    return v
  }
  const result = addSub()
  if (pos !== tokens.length) throw new Error('表达式有多余内容')
  return result
}

/** 求值四则表达式;fields 中的路径先取值 */
export function evalComputed(
  spec: { fields: Record<string, string>; expr: string },
  root: Json
): number | undefined {
  const vars: Record<string, number> = {}
  for (const [name, path] of Object.entries(spec.fields)) {
    const n = asNumber(getPath(root, path))
    if (n === undefined) return undefined
    vars[name] = n
  }
  try {
    return evalTokens(tokenize(spec.expr), vars)
  } catch {
    return undefined
  }
}
