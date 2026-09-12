// 生成品牌色圆形图标(PNG,纯 Node 无依赖:手工构造 PNG chunk + zlib)
// 产物: build/icon.png (256), resources/icons/tray@2x.png (32), tray.png (16)
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'

const R = 0x4d, G = 0x6b, B = 0xfe // #4D6BFE

function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function makePng(size) {
  const cx = (size - 1) / 2, radius = size * 0.46
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // filter none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cx)
      let r = 0, g = 0, b = 0, a = 0
      if (d <= radius) {
        // 简单"饼图"意象:四分之三圆弧 + 缺口,呼应用量仪表
        let ang = Math.atan2(y - cx, x - cx) // -PI..PI
        if (ang < 0) ang += Math.PI * 2
        const inArc = ang >= Math.PI * 0.25 // 315° 弧,右上缺口
        if (inArc) { r = R; g = G; b = B } else { r = 0xc0; g = 0xc8; b = 0xd8 }
        a = 255
        if (d > radius - 2) a = Math.max(0, 255 - (d - (radius - 2)) * 128) // 抗锯齿边
      }
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const files = [
  ['build/icon.png', 256],
  ['resources/icons/tray@2x.png', 32],
  ['resources/icons/tray.png', 16]
]
for (const [file, size] of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, makePng(size))
  console.log('wrote', file, size + 'px')
}
