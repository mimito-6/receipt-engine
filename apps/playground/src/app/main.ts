// Playground bootstrap: wires every control to `state`, then paints.
// Bundled (with the engine) to public/playground.global.js — runs in any browser.
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { getTheme, mergeTheme } from '@receipt-engine/themes'
import { safeValidateReceipt } from '@receipt-engine/core'
import { $, clientToReceipt, dl, readFile, showError, svgEl } from './dom'
import {
  STICKERS,
  THERMAL_LOOK,
  type ThemeName,
  curLook,
  curPad,
  deepClone,
  examples,
  state,
} from './state'
import { applyScale, render } from './render'
import { addSticker, addStickerAt, ensure, renderStickerList, syncFormFromState } from './form'
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
import { layoutOverlay, nudgeSelected, setStickerCommit, setStickerDelete, setStickerSelect } from './overlay'
import { clearSelection, onCanvasDblClick, onCanvasKeydown, refreshInspector } from './inspector'
import { installEdgeHandles } from './resize'
import { beginCanvasGesture } from './reorder'
import { redo, resetHistory, undo } from './history'
import { applyI18n, setLang, t, type Lang } from './i18n'
import { fastPrint, playPrintReveal, setFastPrint } from './printReveal'
import { isMuted, primeAudio, setMuted } from './sound'
import { isHandoffOpen, openHandoff } from './handoff'
import { releaseFocus, toast, trapFocus } from './feel'

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
    .forEach((b) => {
      const on = (b as HTMLElement).dataset.theme === t
      b.classList.toggle('on', on)
      b.setAttribute('aria-pressed', String(on)) // expose selected state to AT (colour alone fails WCAG)
    })
  syncFormFromState()
  render()
  // quick opacity swap so a theme change reads as a fresh "print" (opacity only — rect-safe)
  const host = $('svg-host')
  host.classList.remove('theme-swap')
  void host.offsetWidth
  host.classList.add('theme-swap')
}

function loadExample(key: string): void {
  const ex = examples[key]
  ;($('example') as HTMLSelectElement).value = key // keep the "start from a sample" dropdown in sync
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
  if (typeof cfg.cleanExport === 'boolean') state.cleanExport = cfg.cleanExport
  state.sel = -1
  state.selection = null
  setTheme(cfg.theme === 'thermal' ? 'thermal' : 'custom')
  resetHistory()
}

/** Pick a sticker up from the tray and drop it onto the receipt (a tap = centred add). */
function attachStickerDrag(btn: HTMLButtonElement, content: string): void {
  btn.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button > 0) return
    e.preventDefault()
    const sx = e.clientX
    const sy = e.clientY
    let ghost: HTMLImageElement | null = null
    let dragging = false
    const over = (x: number, y: number): boolean => {
      const p = $('paper').getBoundingClientRect()
      return x >= p.left && x <= p.right && y >= p.top && y <= p.bottom
    }
    const move = (ev: PointerEvent): void => {
      if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return
      dragging = true
      if (!ghost) {
        ghost = document.createElement('img')
        ghost.src = content
        ghost.className = 're-sticker-ghost birth'
        document.body.appendChild(ghost)
        const g = ghost
        window.requestAnimationFrame(() => g.classList.remove('birth')) // lift off the tray
      }
      ghost.style.left = ev.clientX + 'px'
      ghost.style.top = ev.clientY + 'px'
      ghost.classList.toggle('over', over(ev.clientX, ev.clientY))
    }
    const up = (ev: PointerEvent): void => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      if (!dragging) {
        ghost?.remove()
        addSticker(content) // a plain tap drops it in the middle
        return
      }
      if (over(ev.clientX, ev.clientY)) {
        const p = clientToReceipt(ev.clientX, ev.clientY)
        addStickerAt(content, p.x, p.y) // the new handle pops in (see overlay.layoutOverlay)
      }
      // land the ghost where it dropped (shrink+fade), then clean up
      const g = ghost
      if (g) {
        g.classList.add('land')
        const done = (): void => g.remove()
        g.addEventListener('transitionend', done, { once: true })
        window.setTimeout(done, 400)
      }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
  })
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
  $('svg-host').addEventListener('keydown', onCanvasKeydown as EventListener) // Enter/Space on a focused text edits it

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

  // keyboard: nudge the selected sticker with arrow keys (Shift = bigger step) — a precise,
  // a11y-friendly alternative to dragging
  window.addEventListener('keydown', (e) => {
    const sel = state.selection
    if (!sel || sel.kind !== 'sticker') return
    const tag = (e.target as HTMLElement | null)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const d = delta[e.key]
    if (!d) return
    e.preventDefault()
    const step = e.shiftKey ? 12 : 2
    // nudgeSelected updates in place (focus survives → repeated presses work), snaps + pulses +
    // announces, and syncs #json via the commit callback
    nudgeSelected(d[0] * step, d[1] * step)
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
  ;['q-on', 'q-value', 'q-label', 'q-caption', 'q-bg-clear'].forEach((id) =>
    $(id).addEventListener('input', qrUpdate),
  )
  // typing a valid hex unticks 透明 so the colour actually applies (matches wireColor)
  $('q-bg-hex').addEventListener('input', () => {
    const v = ($('q-bg-hex') as HTMLInputElement).value.trim()
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) ($('q-bg-clear') as HTMLInputElement).checked = false
    qrUpdate()
  })
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

  // stickers — vector zine marks (no emoji); each button previews its SVG
  STICKERS.forEach((svg) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('aria-label', t('panel.stickers.title'))
    const im = document.createElement('img')
    im.src = svg
    im.alt = ''
    b.appendChild(im)
    attachStickerDrag(b, svg)
    $('emoji-pick').appendChild(b)
  })
  $('f-sticker').addEventListener('change', function (this: HTMLInputElement) {
    if (this.files && this.files[0]) readFile(this.files[0], (uri) => addSticker(uri))
  })

  // downloads — play the print-feed ceremony, then export. An in-flight guard stops a
  // double-tap mid-ceremony from firing two downloads + two toasts (playPrintReveal resolves
  // immediately while already playing).
  let exporting = false
  const doExport = (fn: () => void | Promise<void>): void => {
    if (exporting || isHandoffOpen()) return // don't stack the print ceremony under the handoff modal
    exporting = true
    primeAudio()
    void playPrintReveal()
      .then(() => fn())
      .finally(() => {
        exporting = false
      })
  }
  $('dl-png').addEventListener('click', () => doExport(downloadPng))
  $('dl-svg').addEventListener('click', () => doExport(downloadSvg))
  $('dl-html').addEventListener('click', () => doExport(downloadHtml))
  ;($('fast-print') as HTMLInputElement).checked = fastPrint()
  $('fast-print').addEventListener('change', function (this: HTMLInputElement) {
    setFastPrint(this.checked)
  })
  // "hand to customer" present-mode
  $('handoff-enter').addEventListener('click', openHandoff)

  // sound mute toggle — default muted; the single source of truth for audio
  const muteBtn = $('mute-toggle') as HTMLButtonElement
  const SPK_ON =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a4 4 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  const SPK_OFF =
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  const syncMute = (): void => {
    const m = isMuted()
    muteBtn.innerHTML = m ? SPK_OFF : SPK_ON
    muteBtn.setAttribute('aria-pressed', m ? 'false' : 'true')
    muteBtn.setAttribute('aria-label', t('sound.toggle')) // SR name (the SVG is aria-hidden; title alone isn't exposed)
  }
  syncMute()
  muteBtn.addEventListener('click', () => {
    primeAudio()
    setMuted(!isMuted())
    syncMute()
  })

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

// First-visit coachmark: a phone visitor has no hover cue, so point at the receipt
// to reveal the core interaction (tap any text to edit). Dismisses on the first canvas
// touch or after a few seconds, and only shows once per browser.
// First-visit "studio" intro: a zine title card that teaches the core interactions, once
// per browser. Dismisses on Start, a tap on the canvas, or a tap on the backdrop.
try {
  if (!localStorage.getItem('re-intro-seen')) {
    const intro = document.createElement('div')
    intro.className = 're-intro'
    intro.setAttribute('role', 'dialog')
    intro.setAttribute('aria-modal', 'true')
    intro.setAttribute('aria-label', t('intro.title'))
    const card = document.createElement('div')
    card.className = 're-intro-card'
    const mk = (cls: string, txt: string, tag = 'div'): HTMLElement => {
      const el = document.createElement(tag)
      el.className = cls
      el.textContent = txt
      return el
    }
    card.append(mk('re-intro-kicker', t('intro.kicker')), mk('re-intro-title', t('intro.title')))
    card.append(mk('re-intro-tag', t('intro.tagline'), 'p'))
    const chips = document.createElement('div')
    chips.className = 're-intro-chips'
    for (const c of [t('intro.chip1'), t('intro.chip2'), t('intro.chip3')]) chips.append(mk('', c, 'span'))
    card.append(chips)
    const go = document.createElement('button')
    go.type = 'button'
    go.className = 're-intro-go'
    go.textContent = t('intro.start')
    card.append(go)
    intro.append(card)
    document.body.append(intro)
    const introBg = [document.querySelector('.layout'), document.querySelector('header')]
    introBg.forEach((el) => el?.setAttribute('aria-hidden', 'true')) // hide the editor from AT while the modal is up
    const dismiss = (): void => {
      intro.classList.add('out')
      introBg.forEach((el) => el?.removeAttribute('aria-hidden'))
      $('svg-host').removeEventListener('pointerdown', dismiss)
      releaseFocus()
      try {
        localStorage.setItem('re-intro-seen', '1')
      } catch {
        /* ignore */
      }
      window.setTimeout(() => intro.remove(), 280)
    }
    go.addEventListener('click', dismiss)
    intro.addEventListener('pointerdown', (e) => {
      if (e.target === intro) dismiss()
    })
    intro.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') dismiss()
    })
    $('svg-host').addEventListener('pointerdown', dismiss)
    window.requestAnimationFrame(() => intro.classList.add('in'))
    trapFocus(intro) // a11y: keep Tab inside the modal, focus Start, restore on dismiss
  }
} catch {
  /* ignore (e.g. localStorage blocked) */
}

// ── autosave + restore ──────────────────────────────────────────────────────
// Debounce the full design (the same blob the config file saves) to localStorage so
// a phone refresh / accidental tab-close never wipes a 10-minute design, and offer to
// restore it once at boot. Reuses buildConfig()/applyConfig() — no new serialization.
const AUTOSAVE_KEY = 're-autosave'
let _saveT = 0
let quotaWarned = false
let dirty = false // unsaved edits since the last successful write
function autosaveNow(): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(buildConfig()))
    dirty = false
  } catch {
    // quota exceeded (a large data-URI image) or storage blocked: drop any older snapshot so
    // the boot prompt never offers a STALE design as "your last design"
    try {
      localStorage.removeItem(AUTOSAVE_KEY)
    } catch {
      /* ignore */
    }
    // tell the user ONCE that auto-restore has stopped — don't fail silently on the heavy
    // image-laden designs most worth saving
    if (!quotaWarned) {
      quotaWarned = true
      toast(t('autosave.quota'))
    }
  }
}
function scheduleAutosave(): void {
  dirty = true
  window.clearTimeout(_saveT)
  _saveT = window.setTimeout(autosaveNow, 900)
}
// form edits fire input/change; canvas gestures don't, so also save on leave/hide
document.addEventListener('input', scheduleAutosave, true)
document.addEventListener('change', scheduleAutosave, true)
// save on hide (covers tab-close / app-switch) — NOT beforeunload, whose synchronous stringify
// of multi-MB base64 images would stall the close on a low-end phone. Only when DIRTY, so an
// idle tab-switch / screen-lock doesn't re-serialize a multi-MB design the 900ms debounce
// already saved.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dirty) autosaveNow()
})

function offerRestore(cfg: unknown): void {
  const bar = document.createElement('div')
  bar.className = 're-restore'
  // a NON-blocking dialog (aria-modal=false, no focus trap): role=status flattens its buttons
  // for some screen readers, so the only "restore my work" action becomes unreachable
  bar.setAttribute('role', 'dialog')
  bar.setAttribute('aria-modal', 'false')
  bar.setAttribute('aria-labelledby', 're-restore-msg')
  const msg = document.createElement('span')
  msg.id = 're-restore-msg'
  msg.textContent = t('restore.prompt')
  const yes = document.createElement('button')
  yes.type = 'button'
  yes.textContent = t('restore.yes')
  const no = document.createElement('button')
  no.type = 'button'
  no.className = 'ghost'
  no.textContent = t('restore.no')
  bar.append(msg, yes, no)
  document.body.appendChild(bar)
  yes.focus() // land focus on the prompt so a keyboard/SR user can act without blind-Tabbing the page
  const close = (): void => bar.remove()
  yes.addEventListener('click', () => {
    applyConfig(cfg)
    close()
  })
  no.addEventListener('click', close)
  // no auto-dismiss timer: both buttons dismiss it, and a 12s timeout could pull the only
  // "restore my work" affordance before a screen-reader / keyboard user reaches it
}

// only at boot, before any interaction, so a returning visitor can pick their work back up
try {
  const saved = localStorage.getItem(AUTOSAVE_KEY)
  if (saved) {
    const cfg = JSON.parse(saved)
    if (cfg && cfg.receipt) offerRestore(cfg)
  }
} catch {
  /* ignore */
}
