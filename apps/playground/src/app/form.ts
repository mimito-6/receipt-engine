// Left-panel form: repeatable rows (items / discounts / payments / stickers),
// and syncFormFromState which pushes the whole state back into the inputs.
import { $ } from './dom'
import { render } from './render'
import { layoutOverlay } from './overlay'
import { type Draft, curLook, curPad, curWidth, esc, isImg, state } from './state'

export function ensure(k: string): any {
  if (!state.receipt[k]) state.receipt[k] = {}
  return state.receipt[k]
}

export function renderItems(): void {
  const box = $('items')
  box.innerHTML = ''
  const canDel = state.receipt.items.length > 1
  state.receipt.items.forEach((it: any, i: number) => {
    const wrap = document.createElement('div')
    const row = document.createElement('div')
    row.className = 'item'
    row.innerHTML =
      '<input type="text" value="' + esc(it.name) + '" placeholder="名稱" data-i="' + i + '" data-k="name" />' +
      '<input type="number" value="' + it.quantity + '" min="1" data-i="' + i + '" data-k="quantity" />' +
      '<input type="number" value="' + it.unitPrice + '" min="0" step="0.01" data-i="' + i + '" data-k="unitPrice" />' +
      (canDel ? '<button class="x" data-rm="' + i + '">×</button>' : '<span></span>')
    wrap.appendChild(row)
    const det = document.createElement('div')
    det.className = 'row2'
    det.style.display = 'none'
    det.innerHTML =
      '<input type="text" value="' + esc(it.variant || '') + '" placeholder="款式/變體" data-i="' + i + '" data-k="variant" />' +
      '<input type="text" value="' + esc((it.tags || []).join(', ')) + '" placeholder="標籤(逗號分隔)" data-i="' + i + '" data-k="tags" />'
    const toggle = document.createElement('div')
    toggle.className = 'det'
    toggle.textContent = '⋯ 款式 / 標籤'
    toggle.onclick = () => {
      det.style.display = det.style.display === 'none' ? 'grid' : 'none'
    }
    wrap.appendChild(toggle)
    wrap.appendChild(det)
    box.appendChild(wrap)
  })
  box.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i!
      const k = inp.dataset.k!
      const it: any = state.receipt.items[i]
      if (k === 'name' || k === 'variant') {
        it[k] = inp.value || undefined
      } else if (k === 'tags') {
        const t = inp.value.split(',').map((s) => s.trim()).filter(Boolean)
        it.tags = t.length ? t : undefined
      } else {
        if (inp.value === '') return
        const num = Number(inp.value)
        if (!Number.isFinite(num)) return
        it[k] = num
      }
      render()
    })
  })
  box.querySelectorAll('[data-rm]').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      state.receipt.items.splice(+(b as HTMLElement).dataset.rm!, 1)
      renderItems()
      render()
    }
  })
}

export function renderDiscounts(): void {
  const box = $('discounts')
  box.innerHTML = ''
  ;((state.receipt as any).discounts || []).forEach((d: any, i: number) => {
    const row = document.createElement('div')
    row.className = 'drow'
    row.innerHTML =
      '<input type="text" value="' + esc(d.label) + '" placeholder="折扣名稱" data-i="' + i + '" data-k="label" />' +
      '<input type="number" value="' + d.amount + '" min="0" step="0.01" data-i="' + i + '" data-k="amount" />' +
      '<button class="x" data-rm="' + i + '">×</button>'
    box.appendChild(row)
  })
  box.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i!
      const k = inp.dataset.k!
      const d: any = (state.receipt as any).discounts[i]
      if (k === 'label') {
        d.label = inp.value
      } else {
        if (inp.value === '') return
        const num = Number(inp.value)
        if (!Number.isFinite(num)) return
        d.amount = num
      }
      render()
    })
  })
  box.querySelectorAll('[data-rm]').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      (state.receipt as any).discounts.splice(+(b as HTMLElement).dataset.rm!, 1)
      if (!(state.receipt as any).discounts.length) delete (state.receipt as any).discounts
      renderDiscounts()
      render()
    }
  })
}

export function renderPayments(): void {
  const box = $('payments')
  box.innerHTML = ''
  ;((state.receipt as any).payments || []).forEach((p: any, i: number) => {
    const row = document.createElement('div')
    row.className = 'prow'
    row.innerHTML =
      '<input type="text" value="' + esc(p.method) + '" placeholder="付款方式" data-i="' + i + '" data-k="method" />' +
      '<input type="number" value="' + p.amount + '" min="0" step="0.01" data-i="' + i + '" data-k="amount" />' +
      '<button class="x" data-rm="' + i + '">×</button>'
    box.appendChild(row)
  })
  box.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i!
      const k = inp.dataset.k!
      const p: any = (state.receipt as any).payments[i]
      if (k === 'method') {
        p.method = inp.value
      } else {
        if (inp.value === '') return
        const num = Number(inp.value)
        if (!Number.isFinite(num)) return
        p.amount = num
      }
      render()
    })
  })
  box.querySelectorAll('[data-rm]').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      (state.receipt as any).payments.splice(+(b as HTMLElement).dataset.rm!, 1)
      if (!(state.receipt as any).payments.length) delete (state.receipt as any).payments
      renderPayments()
      render()
    }
  })
}

export function renderStickerList(): void {
  const box = $('sticker-list')
  box.innerHTML = ''
  ;((state.receipt as any).stickers || []).forEach((s: any, i: number) => {
    const card = document.createElement('div')
    card.className = 'stk'
    const glyph = isImg(s.content)
      ? '<span class="glyph"><img src="' + esc(s.content) + '"/></span>'
      : '<span class="glyph">' + esc(s.content) + '</span>'
    card.innerHTML =
      '<div class="stk-head">' +
      glyph +
      '<span class="grow">' +
      (i === state.sel ? '已選取 · 在收據上可拖' : '點收據上的貼紙可選取') +
      '</span>' +
      '<button class="x" data-rm="' + i + '">×</button></div>' +
      '<label class="field">大小 ' + (s.size || 38) + '</label><input type="range" min="14" max="120" step="2" value="' + (s.size || 38) + '" data-i="' + i + '" data-k="size" />' +
      '<label class="field">旋轉 ' + (s.rotation || 0) + '°</label><input type="range" min="-180" max="180" step="1" value="' + (s.rotation || 0) + '" data-i="' + i + '" data-k="rotation" />'
    box.appendChild(card)
  })
  box.querySelectorAll('input[type=range]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const i = +(inp as HTMLInputElement).dataset.i!
      const k = (inp as HTMLInputElement).dataset.k!
      ;((state.receipt as any).stickers[i] as any)[k] = Number((inp as HTMLInputElement).value)
      const lab = (inp as HTMLElement).previousElementSibling
      if (lab) {
        lab.textContent =
          k === 'size' ? '大小 ' + (inp as HTMLInputElement).value : '旋轉 ' + (inp as HTMLInputElement).value + '°'
      }
      layoutOverlay()
      ;($('json') as HTMLTextAreaElement).value = JSON.stringify(state.receipt, null, 2)
    })
  })
  box.querySelectorAll('[data-rm]').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      (state.receipt as any).stickers.splice(+(b as HTMLElement).dataset.rm!, 1)
      if (!(state.receipt as any).stickers.length) delete (state.receipt as any).stickers
      state.sel = -1
      renderStickerList()
      render()
    }
  })
}

export function addSticker(content: string): void {
  const r: any = state.receipt
  if (!r.stickers) r.stickers = []
  const w = curWidth()
  const num = r.stickers.length
  r.stickers.push({
    content,
    anchor: 'free',
    x: Math.round(w * 0.5 + ((num % 3) - 1) * 60),
    y: 70 + Math.floor(num / 3) * 60,
    size: isImg(content) ? 64 : 46,
    rotation: 0,
  })
  state.sel = r.stickers.length - 1
  renderStickerList()
  render()
}

function val(id: string, v: unknown): void {
  ;($(id) as HTMLInputElement).value = v == null ? '' : String(v)
}

export function syncFormFromState(): void {
  const r: Draft = state.receipt
  const c = curLook()
  const m: any = r.merchant
  const ev: any = r.event || {}
  const tx: any = r.transaction || {}
  const q: any = r.qr || {}
  const msg: any = r.message || {}
  ;($('f-currency') as HTMLSelectElement).value = r.currency || 'TWD'
  val('f-name', m.name)
  val('f-subtitle', m.subtitle)
  val('f-icon', m.icon && !isImg(m.icon) ? m.icon : '')
  $('logo-status').textContent = m.logo ? '✓ 已設定商標圖片(清空 emoji 欄改回文字圖示)' : ''
  val('e-name', ev.name)
  val('e-booth', ev.boothNumber || ev.boothName)
  val('e-location', ev.location)
  val('e-date', ev.date)
  val('t-no', tx.receiptNo)
  val('t-cashier', tx.cashier)
  ;($('t-at') as HTMLInputElement).value = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(tx.issuedAt || '')
    ? tx.issuedAt.slice(0, 16)
    : ''
  ;($('q-on') as HTMLInputElement).checked = !!r.qr
  val('q-value', q.value)
  val('q-label', q.label)
  val('q-caption', q.caption)
  val('m-title', msg.title)
  val('m-body', msg.body)
  val('m-footer', msg.footer)
  ;($('c-primary') as HTMLInputElement).value = c.primary
  ;($('c-bg') as HTMLInputElement).value = c.bg
  ;($('c-surface') as HTMLInputElement).value = c.surface
  ;($('c-text') as HTMLInputElement).value = c.text
  ;($('f-font-latin') as HTMLSelectElement).value = c.latinFont
  ;($('f-font-cjk') as HTMLSelectElement).value = c.cjkFont
  ;($('c-stars') as HTMLInputElement).checked = !!c.stars
  ;($('s-width') as HTMLInputElement).value = String(curWidth())
  $('v-width').textContent = curWidth() + 'px'
  ;($('s-padtop') as HTMLInputElement).value = String(curPad().top)
  $('v-padtop').textContent = curPad().top + 'px'
  ;($('s-padbottom') as HTMLInputElement).value = String(curPad().bottom)
  $('v-padbottom').textContent = curPad().bottom + 'px'
  ;($('s-padx') as HTMLInputElement).value = String(curPad().x)
  $('v-padx').textContent = curPad().x + 'px'
  ;($('s-scale') as HTMLInputElement).value = String(state.scale)
  $('v-scale').textContent = state.scale + 'px'
  const a: any = r.assets || {}
  $('bg-status').textContent = a.backgroundImage ? '✓ 已設定底圖' : '(尚未設定底圖)'
  const bop = a.backgroundOpacity != null ? a.backgroundOpacity : 0.3
  ;($('s-bgop') as HTMLInputElement).value = String(Math.round(bop * 100))
  $('v-bgop').textContent = Math.round(bop * 100) + '%'
  const bsc = a.backgroundScale != null ? a.backgroundScale : 1
  ;($('s-bgsc') as HTMLInputElement).value = String(Math.round(bsc * 100))
  $('v-bgsc').textContent = Math.round(bsc * 100) + '%'
  ;($('s-bgx') as HTMLInputElement).value = String(a.backgroundX != null ? a.backgroundX : 0)
  $('v-bgx').textContent = ($('s-bgx') as HTMLInputElement).value + 'px'
  ;($('s-bgy') as HTMLInputElement).value = String(a.backgroundY != null ? a.backgroundY : 0)
  $('v-bgy').textContent = ($('s-bgy') as HTMLInputElement).value + 'px'
  // panels stay collapsed by default — the user expands what they need
  renderItems()
  renderDiscounts()
  renderPayments()
  renderStickerList()
}
