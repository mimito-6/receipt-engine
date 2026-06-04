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
  configFilename,
  defaultPad,
  downloadHtml,
  downloadSvg,
  fixLook,
  importOrder,
  normPad,
  normalize,
} from './io'
import { downloadPng } from './pngExport'
import { layoutOverlay, setStickerCommit, setStickerDelete, setStickerSelect } from './overlay'
import { clearSelection, onCanvasDblClick, refreshInspector } from './inspector'
import { installEdgeHandles } from './resize'
import { beginCanvasGesture } from './reorder'
import { redo, resetHistory, undo } from './history'
import { applyI18n, setLang, t, type Lang } from './i18n'

// Expose the engine under the historical global so embedders/docs keep working.
;(window as unknown as Record<string, unknown>).ReceiptEngine = {
  renderReceiptToSvg,
  renderReceiptToHtml,
  getTheme,
  mergeTheme,
  safeValidateReceipt,
}

/** #abc -> #aabbcc (the native colour picker needs 6-digit hex). */
function expandHex(h: string): string {
  return '#' + h.slice(1).split('').map((c) => c + c).join('')
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
  state.mono = { custom: false, thermal: true }
  state.edges = { custom: false, thermal: true }
  state.cleanExport = false
  syncFormFromState()
  render()
  resetHistory()
}

function applyConfig(cfg: any): void {
  if (!cfg || !cfg.receipt) {
    showError(t('error.notConfigFile'))
    return
  }
  const c = safeValidateReceipt(cfg.receipt)
  if (!c.success) {
    showError(t('error.configReceiptInvalid') + (c.error?.format() ?? ''))
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
  state.mono = {
    custom: !!(cfg.mono && cfg.mono.custom),
    thermal: cfg.mono ? !!cfg.mono.thermal : true,
  }
  state.edges = {
    custom: !!(cfg.edges && cfg.edges.custom),
    thermal: cfg.edges ? !!cfg.edges.thermal : true,
  }
  if (typeof cfg.scale === 'number') state.scale = cfg.scale
  state.sel = -1
  state.selection = null
  setTheme(cfg.theme === 'thermal' ? 'thermal' : 'custom')
  resetHistory()
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
  setStickerDelete(() => {
    renderStickerList()
    render()
  })

  // canvas: tap text to style it; drag a section to reorder it; double-tap to edit text
  $('svg-host').addEventListener('pointerdown', beginCanvasGesture as EventListener)
  $('svg-host').addEventListener('dblclick', onCanvasDblClick as EventListener)

  // undo / redo (buttons + keyboard)
  $('undo').addEventListener('click', undo)
  $('redo').addEventListener('click', redo)
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const tag = (e.target as HTMLElement | null)?.tagName
    // let text fields use their own native undo
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const k = e.key.toLowerCase()
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault()
      redo()
    }
  })

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
        $('logo-status').textContent = t('status.logoSet')
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
  // QR backing colour: the "透明" toggle wins; otherwise a 3/6-digit hex; otherwise
  // undefined (→ the renderer's default white, which keeps it scannable on any card).
  const qrBg = (): string | undefined => {
    if (($('q-bg-clear') as HTMLInputElement).checked) return 'transparent'
    const v = (($('q-bg-hex') as HTMLInputElement).value || '').trim().toLowerCase()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v
    return undefined
  }
  const qrUpdate = (): void => {
    const on = ($('q-on') as HTMLInputElement).checked
    const v = ($('q-value') as HTMLInputElement).value
    if (on && v) {
      state.receipt.qr = {
        value: v,
        label: ($('q-label') as HTMLInputElement).value || undefined,
        caption: ($('q-caption') as HTMLInputElement).value || undefined,
        background: qrBg(),
      }
    } else {
      delete state.receipt.qr
    }
    render()
  }
  ;['q-on', 'q-value', 'q-label', 'q-caption', 'q-bg-hex', 'q-bg-clear'].forEach((id) =>
    $(id).addEventListener('input', qrUpdate),
  )
  // QR backing colour picker → untick 透明, sync its hex twin, then rebuild
  $('q-bg').addEventListener('input', () => {
    ;($('q-bg-clear') as HTMLInputElement).checked = false
    ;($('q-bg-hex') as HTMLInputElement).value = ($('q-bg') as HTMLInputElement).value
    qrUpdate()
  })

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

  // look (colors with hex twin / fonts / stars / mono)
  const HEX3OR6 = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
  const HEX_ANY = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
  const wireColor = (
    pickerId: string,
    hexId: string,
    key: 'primary' | 'bg' | 'surface' | 'text',
    clearId?: string,
  ): void => {
    const picker = $(pickerId) as HTMLInputElement
    const hex = $(hexId) as HTMLInputElement
    const clear = clearId ? ($(clearId) as HTMLInputElement) : null
    const commit = (): void => {
      const v = hex.value.trim()
      ;(curLook() as any)[key] = clear?.checked ? 'transparent' : HEX_ANY.test(v) ? v : picker.value
      render()
    }
    picker.addEventListener('input', () => {
      if (clear) clear.checked = false
      hex.value = picker.value
      commit()
    })
    hex.addEventListener('input', () => {
      const v = hex.value.trim().toLowerCase()
      if (HEX_ANY.test(v)) {
        if (clear) clear.checked = false
        if (HEX3OR6.test(v)) picker.value = v.length === 4 ? expandHex(v) : v
        commit()
      }
    })
    // "透明" toggle (no typing) — overrides the colour with transparent.
    if (clear) clear.addEventListener('change', commit)
  }
  wireColor('c-primary', 'c-primary-hex', 'primary')
  wireColor('c-bg', 'c-bg-hex', 'bg', 'c-bg-clear')
  wireColor('c-surface', 'c-surface-hex', 'surface', 'c-surface-clear')
  wireColor('c-text', 'c-text-hex', 'text')
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
  $('c-mono').addEventListener('change', function (this: HTMLInputElement) {
    state.mono[state.theme] = this.checked
    render()
  })
  $('c-edges').addEventListener('change', function (this: HTMLInputElement) {
    state.edges[state.theme] = this.checked
    render()
  })
  $('dl-clean').addEventListener('change', function (this: HTMLInputElement) {
    state.cleanExport = this.checked
  })

  // add rows
  $('add-item').addEventListener('click', () => {
    state.receipt.items.push({ name: t('data.defaultItemName.add'), quantity: 1, unitPrice: 100 })
    syncFormFromState()
    render()
  })
  $('add-discount').addEventListener('click', () => {
    if (!state.receipt.discounts) state.receipt.discounts = []
    state.receipt.discounts.push({ label: t('data.defaultDiscountLabel'), amount: 10 })
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
      showError(t('error.jsonInvalid') + (e as Error).message)
      return
    }
    const c = safeValidateReceipt(p)
    if (!c.success) {
      showError(t('error.notReceiptJson') + (c.error?.format() ?? ''))
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
      showError(t('error.jsonInvalid') + (e as Error).message)
      return
    }
    const doc = importOrder(ext)
    const c = safeValidateReceipt(doc as never)
    if (!c.success) {
      showError(t('error.orderToReceiptInvalid') + (c.error?.format() ?? ''))
      return
    }
    state.receipt = normalize(c.data as never)
    state.sel = -1
    state.selection = null
    syncFormFromState()
    render()
  })
  $('import-items').addEventListener('click', () => {
    // open every <details> ancestor of the JSON box (it's nested in 存檔/匯入)
    let node: HTMLElement | null = $('json')
    while (node) {
      const d = node.closest('details') as HTMLDetailsElement | null
      if (!d) break
      d.open = true
      node = d.parentElement
    }
    $('json').focus()
    showError(t('toast.importItemsHint'))
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
        if (a.backgroundRotation == null) a.backgroundRotation = 0
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
      delete a.backgroundRotation
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
  $('s-bgrot').addEventListener('input', function (this: HTMLInputElement) {
    ensure('assets').backgroundRotation = +this.value
    $('v-bgrot').textContent = this.value + '°'
    render()
  })

  // config file
  $('cfg-save').addEventListener('click', () => {
    dl(configFilename(), new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' }))
  })
  $('cfg-load').addEventListener('change', function (this: HTMLInputElement) {
    const f = this.files && this.files[0]
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => {
      try {
        applyConfig(JSON.parse(String(fr.result)))
      } catch (e) {
        showError(t('error.configReadFailed') + (e as Error).message)
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

// language switcher: persist + translate the static chrome, then rebuild the
// dynamically-generated UI (form rows, sticker list, order panel) so its t() strings refresh.
document.querySelectorAll<HTMLButtonElement>('.lang button[data-lang]').forEach((b) => {
  b.addEventListener('click', () => {
    setLang(b.dataset.lang as Lang)
    syncFormFromState()
    render()
  })
})
applyI18n()
