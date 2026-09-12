/* 贴边吸附纯函数单测:node scripts/test-geom.ts */
import assert from 'node:assert'
import { snapToEdge } from '../src/shared/geom.ts'

const WA = { x: 0, y: 0, width: 1920, height: 1080 }
const W = 300
const H = 200

assert.deepEqual(snapToEdge({ x: 5, y: 300, width: W, height: H }, WA), { x: 0, y: 300 }, '距左缘 5px 吸附')
assert.deepEqual(snapToEdge({ x: 1917 - W, y: 300, width: W, height: H }, WA), { x: 1920 - W, y: 300 }, '距右缘 3px 吸附')
assert.deepEqual(snapToEdge({ x: 800, y: 6, width: W, height: H }, WA), { x: 800, y: 0 }, '距顶缘 6px 吸附')
assert.deepEqual(snapToEdge({ x: 800, y: 1072 - H, width: W, height: H }, WA), { x: 800, y: 1080 - H }, '距底缘 8px 吸附')
assert.equal(snapToEdge({ x: 9, y: 500, width: W, height: H }, WA), null, '距左缘 9px 不吸附(磁吸带 8px)')
assert.equal(snapToEdge({ x: 800, y: 500, width: W, height: H }, WA), null, '居中不吸附')
assert.deepEqual(
  snapToEdge({ x: 3, y: 4, width: W, height: H }, WA),
  { x: 0, y: 0 },
  '角落同时吸附两轴'
)
/* 多显示器:工作区有偏移时以该工作区为基准 */
const WA2 = { x: 1920, y: 0, width: 2560, height: 1440 }
assert.deepEqual(snapToEdge({ x: 1924, y: 300, width: W, height: H }, WA2), { x: 1920, y: 300 }, '副屏左缘吸附')

console.log('✓ snapToEdge 全部通过')
