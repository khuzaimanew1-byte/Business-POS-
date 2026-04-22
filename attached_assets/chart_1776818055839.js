/**
 * Vanilla SVG line/area chart — logic aligned with components/sophisticated-line-graph.tsx
 * (generateData, time ranges, 300ms load, Y domain dataMin-50 / dataMax+50, horizontal grid,
 * tick formatting, dashed crosshair tooltip). High point counts make a polyline visually
 * close to Recharts `type="monotone"` without shipping a full spline solver.
 */

const TIME_RANGE_MAP = {
  '1D': 1,
  '5D': 5,
  '1M': 30,
  '6M': 180,
  '1Y': 365,
  '5Y': 1825,
}

const TIME_RANGES = ['1D', '5D', '1M', '6M', '1Y', '5Y']

const TITLE = 'Multi-Series Time Analysis'

function generateData(days) {
  const data = []
  const now = Date.now()
  let value = 1200

  for (let i = days; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
    const timestamp = date.getTime()
    value += (Math.random() - 0.48) * 50

    data.push({
      timestamp,
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      price: Math.max(800, Math.round(value)),
    })
  }
  return data
}

function formatYTick(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(0)}M`
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`
  return `$${v}`
}

function computeYTicks(minVal, maxVal, maxTicks = 6) {
  const span = maxVal - minVal || 1
  const rough = span / Math.max(1, maxTicks - 1)
  const pow10 = 10 ** Math.floor(Math.log10(rough))
  const err = rough / pow10
  let step = pow10
  if (err >= 7.5) step = 10 * pow10
  else if (err >= 3.5) step = 5 * pow10
  else if (err >= 1.5) step = 2 * pow10

  const ticks = []
  const start = Math.floor(minVal / step) * step
  let t = start
  const guard = maxTicks * 6
  let i = 0
  while (t <= maxVal + step * 0.01 && i < guard) {
    if (t >= minVal - step * 0.01) ticks.push(Math.round(t))
    t += step
    i++
  }
  if (ticks.length === 0) ticks.push(minVal, maxVal)
  return ticks
}

function pickXTicks(data, maxLabels) {
  const n = data.length
  if (n === 0) return []
  if (n <= maxLabels) return data.map((d, i) => ({ i, label: d.date }))
  const out = []
  const step = (n - 1) / (maxLabels - 1)
  for (let k = 0; k < maxLabels; k++) {
    const i = Math.round(k * step)
    out.push({ i: Math.min(i, n - 1), label: data[Math.min(i, n - 1)].date })
  }
  return out
}

function pathLinear(points) {
  if (points.length === 0) return ''
  let d = `M${points[0].x},${points[0].y}`
  for (let i = 1; i < points.length; i++) d += `L${points[i].x},${points[i].y}`
  return d
}

/** Closed area under the same polyline as `pathLinear` down to baseline y = `baseY`. */
function areaPathLinear(points, baseY) {
  if (points.length === 0) return ''
  const n = points.length
  const lineD = pathLinear(points)
  const tail = lineD.replace(/^M[\d.-]+,[\d.-]+/, '')
  return `M${points[0].x},${baseY}L${points[0].x},${points[0].y}${tail}L${points[n - 1].x},${baseY}Z`
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pointInRect(x, y, L, T, R, B) {
  return x >= L && x <= R && y >= T && y <= B
}

/** True if the polyline (pts) intersects axis-aligned rect [left,top]..[left+tw, top+th] (with pad). */
function polylineIntersectsTooltipRect(pts, left, top, tw, th, pad = 4) {
  const L = left - pad
  const T = top - pad
  const R = left + tw + pad
  const B = top + th + pad
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = pts[i].x
    const y1 = pts[i].y
    const x2 = pts[i + 1].x
    const y2 = pts[i + 1].y
    if (pointInRect(x1, y1, L, T, R, B) || pointInRect(x2, y2, L, T, R, B)) return true
    const steps = 12
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      const x = x1 + t * (x2 - x1)
      const y = y1 + t * (y2 - y1)
      if (pointInRect(x, y, L, T, R, B)) return true
    }
  }
  return false
}

function init() {
  const rangeRow = document.getElementById('rangeRow')
  const chartWrap = document.getElementById('chartWrap')
  const loading = document.getElementById('loading')
  const svg = document.getElementById('chartSvg')
  const tooltip = document.getElementById('tooltip')

  document.querySelector('[data-card-title]').textContent = TITLE

  let timeRange = '1M'
  let data = []
  let loadTimer = null
  const showGrid = true

  TIME_RANGES.forEach((range) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'range-btn' + (range === timeRange ? ' range-btn--active' : '')
    btn.textContent = range
    btn.dataset.range = range
    btn.addEventListener('click', () => setRange(range))
    rangeRow.appendChild(btn)
  })

  function setRange(range) {
    timeRange = range
    rangeRow.querySelectorAll('.range-btn').forEach((b) => {
      b.classList.toggle('range-btn--active', b.dataset.range === range)
    })
    scheduleLoad()
  }

  function scheduleLoad() {
    if (loadTimer) clearTimeout(loadTimer)
    loading.classList.remove('is-hidden')
    svg.classList.add('is-hidden')

    const days = TIME_RANGE_MAP[timeRange] ?? 30
    const newData = generateData(days)

    loadTimer = setTimeout(() => {
      data = newData
      loading.classList.add('is-hidden')
      svg.classList.remove('is-hidden')
      renderChart()
      loadTimer = null
    }, 300)
  }

  function layout() {
    const w = chartWrap.clientWidth
    const h = chartWrap.clientHeight
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.setAttribute('width', String(w))
    svg.setAttribute('height', String(h))
    return { w, h }
  }

  function renderChart() {
    if (!data.length) return
    const { w, h } = layout()

    const prices = data.map((d) => d.price)
    const rawMin = Math.min(...prices)
    const rawMax = Math.max(...prices)
    const yMin = rawMin - 50
    const yMax = rawMax + 50

    const maxTickStr = formatYTick(yMax)
    const leftPad = Math.min(76, Math.max(44, 14 + maxTickStr.length * 7))

    const margin = { top: 10, right: 30, bottom: 28, left: leftPad }
    const plotW = w - margin.left - margin.right
    const plotH = h - margin.top - margin.bottom
    const n = data.length
    const baseY = margin.top + plotH

    const xAt = (i) => margin.left + (plotW * i) / Math.max(1, n - 1)
    const yAt = (v) => margin.top + plotH * (1 - (v - yMin) / (yMax - yMin || 1))

    const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.price) }))
    const lineD = pathLinear(pts)
    const areaD = areaPathLinear(pts, baseY)

    const yTicks = computeYTicks(yMin, yMax)
    const xTickMeta = pickXTicks(data, Math.min(18, Math.max(6, Math.floor(plotW / 72))))

    let inner = ''

    inner += `<line class="axis-line" x1="${margin.left}" y1="${baseY}" x2="${margin.left + plotW}" y2="${baseY}" />`
    inner += `<line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${baseY}" />`

    if (showGrid) {
      yTicks.forEach((tv) => {
        const yy = yAt(tv)
        inner += `<line class="grid-line" x1="${margin.left}" y1="${yy}" x2="${margin.left + plotW}" y2="${yy}" />`
      })
    }

    inner += `<path class="area-path" d="${areaD}" />`
    inner += `<path class="line-path" d="${lineD}" />`

    const pointR = n > 400 ? 1.5 : n > 120 ? 2.2 : 3.2
    pts.forEach((p) => {
      inner += `<circle class="data-point" cx="${p.x}" cy="${p.y}" r="${pointR}" />`
    })

    yTicks.forEach((tv) => {
      const yy = yAt(tv)
      inner += `<text class="tick" x="${margin.left - 10}" y="${yy + 4}" text-anchor="end">${escapeXml(
        formatYTick(tv),
      )}</text>`
    })

    xTickMeta.forEach(({ i, label }) => {
      const xx = xAt(i)
      inner += `<text class="tick" x="${xx}" y="${baseY + 18}" text-anchor="middle">${escapeXml(label)}</text>`
    })

    inner += `<line id="cursorLine" class="cursor-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${baseY}" />`

    inner += `<rect class="hit-layer" x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" />`

    svg.innerHTML = inner

    const hit = svg.querySelector('.hit-layer')
    const cursorLine = svg.getElementById('cursorLine')

    hit.addEventListener('mousemove', (ev) => {
      const rect = svg.getBoundingClientRect()
      const sx = ((ev.clientX - rect.left) / rect.width) * w
      const rel = sx - margin.left
      let idx = Math.round((rel / plotW) * (n - 1))
      idx = Math.max(0, Math.min(n - 1, idx))
      const px = xAt(idx)
      cursorLine.setAttribute('x1', px)
      cursorLine.setAttribute('x2', px)
      cursorLine.classList.add('is-on')

      const d = data[idx]
      tooltip.querySelector('[data-tip-date]').textContent = d.date
      tooltip.querySelector('[data-tip-price]').textContent = `$${d.price.toLocaleString()}`
      tooltip.classList.add('is-visible')

      const tw = tooltip.offsetWidth
      const th = tooltip.offsetHeight

      const topAnchor = margin.top + 6
      let left = px - tw / 2
      left = Math.max(margin.left + 4, Math.min(left, margin.left + plotW - tw - 4))

      let top = topAnchor
      let guard = 0
      while (
        polylineIntersectsTooltipRect(pts, left, top, tw, th) &&
        guard < 60 &&
        top + th < margin.top + plotH - 6
      ) {
        top += 8
        guard++
      }

      tooltip.style.left = `${left}px`
      tooltip.style.top = `${top}px`
    })

    hit.addEventListener('mouseleave', () => {
      cursorLine.classList.remove('is-on')
      tooltip.classList.remove('is-visible')
    })
  }

  const ro = new ResizeObserver(() => {
    if (data.length && loading.classList.contains('is-hidden')) renderChart()
  })
  ro.observe(chartWrap)

  scheduleLoad()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
