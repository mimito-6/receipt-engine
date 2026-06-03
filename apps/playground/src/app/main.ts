// Playground bootstrap: wires every control to `state`, then paints.
// Bundled (with the engine) to public/playground.global.js — runs in any browser.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { safeValidateReceipt } from '@receipt-engine/core'
import { $, dl, readFile, showError } from './dom'
import {
  EMOJIS,
  THERMAL_LOOK,
  type ThemeName,
  curLook,
  curPad,
  deepClone,
  examples,
  state,
} from './state'
import { applyScale, render } from './render'
import { addSticker, ensure, renderStickerList, syncFormFromState } from './form'
import {
  buildConfig,
  defaultPad,
  downloadHtml,
  downloadSvg,
  fixLook,
  importOrder,
  normPad,
  normalize,
} from './io'
import { downloadPng } from './pngExport'
import { layoutOverlay, setStickerCommit, setStickerSelect } from './overlay'
import { clearSelection, refreshInspector } from './inspector'
import { installEdgeHandles } from './resize'
import { beginCanvasGesture } from './reorder'

// Expose the engine under the historical global so embedders/docs keep working.
;(window as unknown as Record<string, unknown>).ReceiptEngine = {
  renderReceiptToSvg,
  renderReceiptToHtml,
  getTheme,
  mergeTheme,
  safeValidateReceipt,
}

function setTheme(t: ThemeName): void {
  state.theme = t
  $('theme-seg')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.theme === t))
  syncFormFromState()
  render()
}

function loadExample(key: string): void {
  const ex = examples[key]
  state.receipt = normalize(deepClone(ex.receipt))
  state.sel = -1
  state.selection = null
  state.look.custom = Object.assign({ stars: false }, deepClone(ex.custom))
  state.look.thermal = deepClone(THERMAL_LOOK)
  state.pad = { custom: defaultPad('custom'), thermal: defaultPad('thermal') }
  syncFormFromState()
  render()
}

function applyConfig(cfg: any): void {
  if (!cfg || !cfg.receipt) {
    showError('這不是有效的設定檔(缺 receipt)。')
    return
  }
  const c = safeValidateReceipt(cfg.receipt)
  if (!c.success) {
    showError('設定檔內的收據不合格:\n\n' + (c.error?.format() ?? ''))
    return
  }
  state.receipt = normalize(c.data as never)
  state.look.custom = fixLook(cfg.look && cfg.look.custom, state.look.custom as never)
  state.look.thermal = fixLook(cfg.look && cfg.look.thermal, THERMAL_LOOK)
  state.width = {
    custom: (cfg.width && cfg.width.custom) || 720,
    thermal: (cfg.width && cfg.width.thermal) || 384,
  }
  state.pad = {
    custom: normPad(cfg.pad && cfg.pad.custom, 'custom'),
    thermal: normPad(cfg.pad && cfg.pad.thermal, 'thermal'),
  }
  if (typeof cfg.scale === 'number') state.scale = cfg.scale
  state.sel = -1
  state.selection = null
  setTheme(cfg.theme === 'thermal' ? 'thermal' : 'custom')
}

function wire(): void {
  // sticker overlay callbacks
  setStickerCommit(() => {
    ;($('json') as HTMLTextAreaElement).value = JSON.stringify(state.receipt, null, 2)
    renderStickerList()
  })
  setStickerSelect(() => {
    clearSelection() // selecting a sticker closes the text inspector
    renderStickerList()
  })

  // canvas: tap text to style it; drag a section to reorder it
  $('svg-host').addEventListener('pointerdown', beginCanvasGesture as EventListener)

  // theme + example
  $('theme-seg')
    .querySelectorAll('button')
    .forEach((b) => {
      ;(b as HTMLElement).onclick = () => setTheme((b as HTMLElement).dataset.theme as ThemeName)
    })
  $('example').addEventListener('change', (e) => loadExample((e.target as HTMLSelectElement).value))
  $('f-currency').addEventListener('change', function (this: HTMLSelectElement) {
    state.receipt.currency = this.value
    render()
  })

  // dimensions
  $('s-width').addEventListener('input', function (this: HTMLInputElement) {
    state.width[state.theme] = +this.value
    $('v-width').textContent = this.value + 'px'
    render()
  })
  $('s-padtop').addEventListener('input', function (this: HTMLInputElement) {
    curPad().top = +this.value
    $('v-padtop').textContent = this.value + 'px'
    render()
  })
  $('s-padbottom').addEventListener('input', function (this: HTMLInputElement) {
    curPad().bottom = +this.value
    $('v-padbottom').textContent = this.value + 'px'
    render()
  })
  $('s-padx').addEventListener('input', function (this: HTMLInputElement) {
    curPad().x = +this.value
    $('v-padx').textContent = this.value + 'px'
    render()
  })
  $('s-scale').addEventListener('input', function (this: HTMLInputElement) {
    state.scale = +this.value
    $('v-scale').textContent = this.value + 'px'
    applyScale()
    layoutOverlay()
    refreshInspector()
  })

  // merchant
  $('f-name').addEventListener('input', function (this: HTMLInputElement) {
    state.receipt.merchant.name = this.value || undefined
    render()
  })
  $('f-subtitle').addEventListener('input', function (this: HTMLInputElement) {
    state.receipt.merchant.subtitle = this.value || undefined
    render()
  })
  $('f-icon').addEventListener('input', function (this: HTMLInputElement) {
    state.receipt.merchant.icon = this.value || undefined
    if (this.value) {
      state.receipt.merchant.logo = undefined
      $('logo-status').textContent = ''
    }
    render()
  })
  $('f-logo').addEventListener('change', function (this: HTMLInputElement) {
    if (this.files && this.files[0])
      readFile(this.files[0], (uri) => {
        state.receipt.merchant.logo = uri
        state.receipt.merchant.icon = undefined
        ;($('f-icon') as HTMLInputElement).value = ''
        $('logo-status').textContent = '✓ 已設定商標圖片'
        render()
      })
  })

  // event / transaction
  const evField = (id: string, key: string): void => {
    $(id).addEventListener('input', function (this: HTMLInputElement) {
      const ev = ensure('event')
      ev[key] = this.value || undefined
      if (!Object.keys(ev).some((k) => ev[k])) delete state.receipt.event
      render()
    })
  }
  evField('e-name', 'name')
  evField('e-booth', 'boothNumber')
  evField('e-location', 'location')
  evField('e-date', 'date')
  $('t-no').addEventListener('input', function (this: HTMLInputElement) {
    ensure('transaction').receiptNo = this.value
    render()
  })
  $('t-at').addEventListener('input', function (this: HTMLInputElement) {
    ensure('transaction').issuedAt = this.value || ''
    render()
  })
  $('t-cashier').addEventListener('input', function (this: HTMLInputElement) {
    ensure('transaction').cashier = this.value || undefined
    render()
  })

  // qr
  const qrUpdate = (): void => {
    const on = ($('q-on') as HTMLInputElement).checked
    const v = ($('q-value') as HTMLInputElement).value
    if (on && v) {
      state.receipt.qr = {
        value: v,
        label: ($('q-label') as HTMLInputElement).value || undefined,
        caption: ($('q-caption') as HTMLInputElement).value || undefined,
      }
    } else {
      delete state.receipt.qr
    }
    render()
  }
  ;['q-on', 'q-value', 'q-label', 'q-caption'].forEach((id) => $(id).addEventListener('input', qrUpdate))

  // message
  const msgUpdate = (): void => {
    const m: any = {
      title: ($('m-title') as HTMLInputElement).value || undefined,
      body: ($('m-body') as HTMLInputElement).value || undefined,
      footer: ($('m-footer') as HTMLInputElement).value || undefined,
    }
    if (m.title || m.body || m.footer) state.receipt.message = m
    else delete state.receipt.message
    render()
  }
  ;['m-title', 'm-body', 'm-footer'].forEach((id) => $(id).addEventListener('input', msgUpdate))

  // look (colors / fonts / stars)
  ;['c-primary', 'c-bg', 'c-surface', 'c-text'].forEach((id) => {
    $(id).addEventListener('input', function (this: HTMLInputElement) {
      const key = { 'c-primary': 'primary', 'c-bg': 'bg', 'c-surface': 'surface', 'c-text': 'text' }[
        id
      ] as keyof ReturnType<typeof curLook>
      ;(curLook() as any)[key] = this.value
      render()
    })
  })
  $('f-font-latin').addEventListener('change', function (this: HTMLSelectElement) {
    curLook().latinFont = this.value
    render()
  })
  $('f-font-cjk').addEventListener('change', function (this: HTMLSelectElement) {
    curLook().cjkFont = this.value
    render()
  })
  $('c-stars').addEventListener('change', function (this: HTMLInputElement) {
    curLook().stars = this.checked
    render()
  })

  // add rows
  $('add-item').addEventListener('click', () => {
    state.receipt.items.push({ name: '新品項', quantity: 1, unitPrice: 100 })
    syncFormFromState()
    render()
  })
  $('add-discount').addEventListener('click', () => {
    if (!state.receipt.discounts) state.receipt.discounts = []
    state.receipt.discounts.push({ label: '折扣', amount: 10 })
    syncFormFromState()
    render()
  })
  $('add-payment').addEventListener('click', () => {
    if (!state.receipt.payments) state.receipt.payments = []
    state.receipt.payments.push({ method: 'Cash', amount: 0 })
    syncFormFromState()
    render()
  })

  // stickers
  EMOJIS.forEach((em) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = em
    b.onclick = () => addSticker(em)
    $('emoji-pick').appendChild(b)
  })
  $('f-sticker').addEventListener('change', function (this: HTMLInputElement) {
    if (this.files && this.files[0]) readFile(this.files[0], (uri) => addSticker(uri))
  })

  // downloads
  $('dl-png').addEventListener('click', downloadPng)
  $('dl-svg').addEventListener('click', downloadSvg)
  $('dl-html').addEventListener('click', downloadHtml)

  // JSON load
  $('load-receipt').addEventListener('click', () => {
    let p: any
    try {
      p = JSON.parse(($('json') as HTMLTextAreaElement).value)
    } catch (e) {
      showError('JSON 格式有誤:\n' + (e as Error).message)
      return
    }
    const c = safeValidateReceipt(p)
    if (!c.success) {
      showError('這份 JSON 不是有效的收據:\n\n' + (c.error?.format() ?? ''))
      return
    }
    state.receipt = normalize(c.data as never)
    state.sel = -1
    state.selection = null
    syncFormFromState()
    render()
  })
  $('load-order').addEventListener('click', () => {
    let ext: any
    try {
      ext = JSON.parse(($('json') as HTMLTextAreaElement).value)
    } catch (e) {
      showError('JSON 格式有誤:\n' + (e as Error).message)
      return
    }
    const doc = importOrder(ext)
    const c = safeValidateReceipt(doc as never)
    if (!c.success) {
      showError('訂單轉成收據後不合格(請檢查欄位):\n\n' + (c.error?.format() ?? ''))
      return
    }
    state.receipt = normalize(c.data as never)
    state.sel = -1
    state.selection = null
    syncFormFromState()
    render()
  })
  $('import-items').addEventListener('click', () => {
    ;(document.querySelector('details.card:last-of-type') as HTMLDetailsElement).open = true
    $('json').focus()
    showError('把 POS/訂單系統的 JSON 貼到下方「進階:JSON」,按「載入訂單 JSON」即可。之後接系統就走 importOrder()。')
  })

  window.addEventListener('resize', () => {
    layoutOverlay()
    refreshInspector()
  })

  // background image
  $('f-bg').addEventListener('change', function (this: HTMLInputElement) {
    if (this.files && this.files[0])
      readFile(this.files[0], (uri) => {
        const a = ensure('assets')
        a.backgroundImage = uri
        if (a.backgroundOpacity == null) a.backgroundOpacity = 0.3
        if (a.backgroundScale == null) a.backgroundScale = 1
        if (a.backgroundX == null) a.backgroundX = 0
        if (a.backgroundY == null) a.backgroundY = 0
        syncFormFromState()
        render()
      })
  })
  $('bg-remove').addEventListener('click', () => {
    const a: any = state.receipt.assets
    if (a) {
      delete a.backgroundImage
      delete a.backgroundOpacity
      delete a.backgroundScale
      delete a.backgroundX
      delete a.backgroundY
      if (!Object.keys(a).length) delete state.receipt.assets
    }
    syncFormFromState()
    render()
  })
  $('s-bgop').addEventListener('input', function (this: HTMLInputElement) {
    ensure('assets').backgroundOpacity = +this.value / 100
    $('v-bgop').textContent = this.value + '%'
    render()
  })
  $('s-bgsc').addEventListener('input', function (this: HTMLInputElement) {
    ensure('assets').backgroundScale = +this.value / 100
    $('v-bgsc').textContent = this.value + '%'
    render()
  })
  $('s-bgx').addEventListener('input', function (this: HTMLInputElement) {
    ensure('assets').backgroundX = +this.value
    $('v-bgx').textContent = this.value + 'px'
    render()
  })
  $('s-bgy').addEventListener('input', function (this: HTMLInputElement) {
    ensure('assets').backgroundY = +this.value
    $('v-bgy').textContent = this.value + 'px'
    render()
  })

  // config file
  $('cfg-save').addEventListener('click', () => {
    dl('receipt-config.json', new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' }))
  })
  $('cfg-load').addEventListener('change', function (this: HTMLInputElement) {
    const f = this.files && this.files[0]
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => {
      try {
        applyConfig(JSON.parse(String(fr.result)))
      } catch (e) {
        showError('設定檔讀取失敗:\n' + (e as Error).message)
      }
    }
    fr.readAsText(f)
    this.value = ''
  })
}

// boot — load data first (sets state.receipt), then apply theme UI
wire()
installEdgeHandles()
loadExample('cute')
setTheme('custom')
