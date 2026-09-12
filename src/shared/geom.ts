/* 悬浮窗几何:贴边吸附纯函数(设计 §9.1,8px 磁吸) */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** 距工作区边缘 ≤8px 时吸附到边缘;不需要吸附返回 null */
export function snapToEdge(b: Bounds, workArea: Bounds, snapPx = 8): { x: number; y: number } | null {
  let x = b.x
  let y = b.y
  const left = Math.abs(b.x - workArea.x) <= snapPx
  const right = Math.abs(b.x + b.width - (workArea.x + workArea.width)) <= snapPx
  const top = Math.abs(b.y - workArea.y) <= snapPx
  const bottom = Math.abs(b.y + b.height - (workArea.y + workArea.height)) <= snapPx
  if (left) x = workArea.x
  else if (right) x = workArea.x + workArea.width - b.width
  if (top) y = workArea.y
  else if (bottom) y = workArea.y + workArea.height - b.height
  if (x === b.x && y === b.y) return null
  return { x, y }
}
