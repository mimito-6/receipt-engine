/*
 * OpenBooth ⇄ receipt-engine glue (OB.receipt).
 *
 * Drop this into OpenBooth (Boothレジ) AFTER openbooth-receipt-bridge.global.js
 * and store.js. It hooks checkout: from the committed transaction it renders the
 * merchant's configured receipt and offers two deliveries — thermal print over
 * Web Bluetooth, or share the image to the customer's phone.
 *
 * Wiring (see INTEGRATION.md): in front.js complete(s), right after
 *   const savedTx = OB.store.addTransaction(tx);
 * add:
 *   if (window.OB && OB.receipt) OB.receipt.handle(savedTx);
 *
 * Self-contained: only needs window.ReceiptBridge and window.OB.store.
 */
(function () {
  'use strict'
  var TEMPLATE_KEY = 'openbooth_receipt_template_v1'
  var SETTINGS_KEY = 'openbooth_receipt_settings_v1'
  var printer = null

  function B() { return window.ReceiptBridge }
  function store() { return window.OB && window.OB.store }
  function ready() {
    if (!B()) { console.warn('[OB.receipt] ReceiptBridge not loaded'); return false }
    return true
  }

  /* ---------- persistence ---------- */
  function loadTemplate() { try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || 'null') } catch (e) { return null } }
  function saveTemplate(cfg) { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(cfg)) }
  function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } catch (e) { return {} } }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) }

  /* ---------- fonts (mirror the playground stacks) ---------- */
  var LATIN = { quicksand: "'Quicksand'", nunito: "'Nunito'", baloo: "'Baloo 2'", poppins: "'Poppins'", fredoka: "'Fredoka'", spacemono: "'Space Mono'", cubic: "'Cubic 11'", boutique: "'Boutique Bitmap 9x9'", boutiqueBold: "'Boutique Bitmap 9x9 Bold'" }
  var CJK = { noto: "'Noto Sans TC'", cubic: "'Cubic 11'", boutique: "'Boutique Bitmap 9x9'", boutiqueBold: "'Boutique Bitmap 9x9 Bold'", sarasa: "'Sarasa Mono TC'", system: "'PingFang TC','Microsoft JhengHei'" }
  function fontStack(l, c) { return (LATIN[l] || LATIN.quicksand) + ',' + (CJK[c] || CJK.noto) + ",'PingFang TC','Microsoft JhengHei',sans-serif" }
  function lookOverride(look) {
    return {
      palette: { primary: look.primary, accent: look.primary, secondary: look.primary, background: look.bg, surface: look.surface, text: look.text },
      typography: { fontFamily: fontStack(look.latinFont, look.cjkFont) },
      decoration: { showCornerStars: !!look.stars },
    }
  }

  /* ---------- order + template → ReceiptDocument ---------- */
  function mapSettings(s) {
    s = s || {}
    return { shopName: s.shopName, currencyCode: s.currencyCode, currencySymbol: s.currencySymbol, locale: s.locale }
  }
  function eventFor(st, tx) {
    if (!st) return null
    try { if (typeof st.currentEvent === 'function') { var e = st.currentEvent(); if (e) return e } } catch (x) {}
    var data = (st.get && st.get()) || {}
    var list = data.events || []
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === tx.eventId) return list[i]
    return null
  }
  function pick(o, keys) { o = o || {}; var out = {}, has = false; keys.forEach(function (k) { if (o[k] != null) { out[k] = o[k]; has = true } }); return has ? out : undefined }
  function extractDesign(r) {
    if (!r) return {}
    return {
      merchant: pick(r.merchant, ['logo', 'subtitle', 'icon', 'socials', 'address', 'website']),
      message: r.message, qr: r.qr, assets: r.assets, stickers: r.stickers,
      styleOverrides: r.styleOverrides, blockOrder: r.blockOrder,
    }
  }

  function buildMerged(tx) {
    var st = store()
    var data = (st && st.get && st.get()) || {}
    var doc = B().importOpenBoothOrder(tx, { settings: mapSettings(data.settings), event: eventFor(st, tx) })
    var tpl = loadTemplate()
    var merged = B().applyTemplate(doc, tpl && tpl.receipt ? extractDesign(tpl.receipt) : {})
    return { merged: merged, tpl: tpl }
  }

  // target: 'print' (force thermal, 384) or 'send'/'preview' (template theme).
  function renderOpts(tpl, target) {
    var themeName = target === 'print' ? 'thermal' : (tpl && tpl.theme) || 'custom'
    var look = tpl && tpl.look ? tpl.look[themeName] : null
    var theme = look ? B().mergeTheme(B().getTheme(themeName), lookOverride(look)) : B().getTheme(themeName)
    var width = target === 'print' ? 384 : (tpl && tpl.width && tpl.width[themeName]) || (themeName === 'thermal' ? 384 : 720)
    var pad = tpl && tpl.pad ? tpl.pad[themeName] : null
    var ro = { theme: theme, width: width }
    if (pad) { ro.padTop = pad.top; ro.padBottom = pad.bottom; ro.padX = pad.x }
    return { opts: ro, theme: theme }
  }
  function fontStacksFor(theme, tpl) {
    var stacks = []
    if (theme && theme.typography && theme.typography.fontFamily) stacks.push(theme.typography.fontFamily)
    var so = (tpl && tpl.receipt && tpl.receipt.styleOverrides) || {}
    for (var id in so) if (so[id] && so[id].fontFamily) stacks.push(so[id].fontFamily)
    return stacks
  }
  // instant render (no embedded fonts) — for snappy preview
  function renderSvg(merged, tpl, target) {
    return B().renderReceiptToSvg(merged, renderOpts(tpl, target).opts)
  }
  // faithful render: embed the designed fonts so print/share match the template
  function renderSvgEmbedded(merged, tpl, target) {
    var r = renderOpts(tpl, target)
    var probe = B().renderReceiptToSvg(merged, r.opts)
    if (!B().buildFontFaceCss) return Promise.resolve(probe)
    return B().buildFontFaceCss(fontStacksFor(r.theme, tpl), probe)
      .then(function (css) { if (css) r.opts.fontFaceCss = css; return B().renderReceiptToSvg(merged, r.opts) })
      .catch(function () { return probe })
  }

  /* ---------- printer ---------- */
  function getPrinter() { if (!printer) printer = new (B().BluetoothThermalPrinter)(); return printer }

  function doPrint(merged, tpl) {
    return renderSvgEmbedded(merged, tpl, 'print')
      .then(function (svg) { return B().printReceiptSvg(svg, getPrinter(), { dots: 384, bitmap: { dither: 'floyd-steinberg' } }) })
      .then(function () { toast('🖨 已送出列印') })
      .catch(function (e) { toast('列印失敗:' + (e && e.message || e)); throw e })
  }
  function doSend(merged, tpl) {
    return renderSvgEmbedded(merged, tpl, 'send')
      .then(function (svg) { return B().shareReceiptSvg(svg, { title: '收據 Receipt', text: '感謝您的購買 ♡', filename: 'receipt.png' }) })
      .then(function (res) { toast(res.shared ? '📲 已分享收據' : '⬇ 已下載收據圖') })
      .catch(function (e) { toast('傳送失敗:' + (e && e.message || e)) })
  }

  /* ---------- minimal self-contained UI ---------- */
  function ensureStyles() {
    if (document.getElementById('re-glue-style')) return
    var css =
      '.re-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;display:flex;align-items:flex-end;justify-content:center}' +
      '.re-sheet{background:#fff;color:#1f2430;width:100%;max-width:460px;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -10px 40px rgba(0,0,0,.35);font-family:system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif}' +
      '.re-sheet h3{margin:0 0 10px;font-size:16px;display:flex;align-items:center;gap:8px}' +
      '.re-sheet h3 .x{margin-left:auto;border:none;background:#f3f3f5;color:#888;width:30px;height:30px;border-radius:9px;font-size:18px;cursor:pointer}' +
      '.re-preview{max-height:42vh;overflow:auto;background:#f6f6f8;border-radius:12px;padding:10px;text-align:center;margin-bottom:12px}' +
      '.re-preview svg{max-width:230px;width:100%;height:auto;filter:drop-shadow(0 6px 16px rgba(0,0,0,.2))}' +
      '.re-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}' +
      '.re-btn{font:inherit;font-size:15px;font-weight:600;padding:14px;border-radius:12px;border:1.5px solid #e7e7ec;background:#fff;color:#1f2430;cursor:pointer}' +
      '.re-btn.primary{background:#d6336c;border-color:#d6336c;color:#fff}' +
      '.re-btn.full{grid-column:1 / -1}' +
      '.re-row{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:14px}' +
      '.re-row input[type=file]{font-size:12px}' +
      '.re-note{font-size:12px;color:#6b7280;margin:6px 0 0;line-height:1.5}' +
      '.re-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1f2430;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:9999;font-family:system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3)}'
    var el = document.createElement('style'); el.id = 're-glue-style'; el.textContent = css
    document.head.appendChild(el)
  }
  function sheet(titleHtml) {
    ensureStyles()
    var ov = document.createElement('div'); ov.className = 're-ov'
    var sh = document.createElement('div'); sh.className = 're-sheet'
    sh.innerHTML = '<h3>' + titleHtml + '<button class="x" aria-label="關閉">×</button></h3>'
    ov.appendChild(sh)
    function close() { ov.remove() }
    ov.addEventListener('click', function (e) { if (e.target === ov) close() })
    sh.querySelector('.x').addEventListener('click', close)
    document.body.appendChild(ov)
    return { ov: ov, sheet: sh, close: close }
  }
  var toastTimer = null
  function toast(msg) {
    var t = document.getElementById('re-toast-el')
    if (!t) { t = document.createElement('div'); t.id = 're-toast-el'; t.className = 're-toast'; document.body.appendChild(t) }
    t.textContent = msg; t.style.display = 'block'
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { t.style.display = 'none' }, 2600)
  }

  /* ---------- public flows ---------- */
  function handle(tx) {
    if (!ready() || !tx) return
    var built
    try { built = buildMerged(tx) } catch (e) { toast('收據產生失敗:' + (e && e.message || e)); return }
    var settings = loadSettings()
    if (settings.autoPrint) { doPrint(built.merged, built.tpl).catch(function () {}) }

    var s = sheet('🧾 收據')
    var preview = document.createElement('div'); preview.className = 're-preview'
    try { preview.innerHTML = renderSvg(built.merged, built.tpl, 'preview') } catch (e) { preview.textContent = '(預覽失敗)' }
    s.sheet.appendChild(preview)
    // upgrade the preview with the designed (embedded) fonts once fetched
    renderSvgEmbedded(built.merged, built.tpl, 'preview').then(function (svg) { preview.innerHTML = svg }).catch(function () {})

    var actions = document.createElement('div'); actions.className = 're-actions'
    actions.innerHTML =
      '<button class="re-btn primary" data-act="print">🖨 列印到收據機</button>' +
      '<button class="re-btn" data-act="send">📲 傳給客人手機</button>' +
      '<button class="re-btn full" data-act="settings" style="font-weight:500;font-size:13px;color:#6b7280">⚙ 收據設定 / 配對印表機</button>'
    s.sheet.appendChild(actions)
    actions.querySelector('[data-act="print"]').addEventListener('click', function () { doPrint(built.merged, built.tpl).catch(function () {}) })
    actions.querySelector('[data-act="send"]').addEventListener('click', function () { doSend(built.merged, built.tpl) })
    actions.querySelector('[data-act="settings"]').addEventListener('click', function () { s.close(); openSettings() })
  }

  function pairPrinter() {
    if (!ready()) return Promise.reject(new Error('bridge missing'))
    return getPrinter().connect()
      .then(function () { toast('✓ 已配對:' + (getPrinter().name || '收據機')) })
      .catch(function (e) { toast('配對失敗:' + (e && e.message || e)); throw e })
  }

  function importTemplateFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader()
      fr.onload = function () {
        try {
          var cfg = JSON.parse(String(fr.result))
          if (!cfg || !cfg.receipt) throw new Error('不是有效的版型設定檔(缺 receipt)')
          saveTemplate(cfg); toast('✓ 已套用版型'); resolve(cfg)
        } catch (e) { toast('版型讀取失敗:' + (e && e.message || e)); reject(e) }
      }
      fr.readAsText(file)
    })
  }

  function openSettings() {
    var st = loadSettings()
    var s = sheet('⚙ 收據設定')
    var body = document.createElement('div')
    var hasTpl = !!loadTemplate()
    var sup = B() && B().BluetoothThermalPrinter ? B().BluetoothThermalPrinter.supported : false
    body.innerHTML =
      '<button class="re-btn full" data-act="pair" style="margin-bottom:10px">🔗 配對 / 連線收據機</button>' +
      '<div class="re-row"><span>結帳後自動列印</span><input type="checkbox" id="re-auto" ' + (st.autoPrint ? 'checked' : '') + ' style="margin-left:auto;width:20px;height:20px"></div>' +
      '<div class="re-row"><span>版型設定檔</span><span style="margin-left:auto;color:' + (hasTpl ? '#2f9e44' : '#6b7280') + '">' + (hasTpl ? '✓ 已設定' : '未設定') + '</span></div>' +
      '<label class="re-btn full" style="display:block;text-align:center;margin-bottom:6px">⬆ 匯入版型設定檔<input type="file" accept="application/json,.json" id="re-tpl" style="display:none"></label>' +
      '<p class="re-note">版型設定檔 = 在 receipt-engine 試玩場「下載設定檔」得到的 JSON。列印用黑白收據機版型,傳送用你設計的彩色版型。' +
      (sup ? '' : '<br>⚠ 此瀏覽器不支援藍牙列印(iPhone/Safari);仍可用「傳給客人手機」。') + '</p>'
    s.sheet.appendChild(body)
    body.querySelector('[data-act="pair"]').addEventListener('click', function () { pairPrinter().catch(function () {}) })
    body.querySelector('#re-auto').addEventListener('change', function () { st.autoPrint = this.checked; saveSettings(st) })
    body.querySelector('#re-tpl').addEventListener('change', function () { if (this.files && this.files[0]) importTemplateFile(this.files[0]).then(function () { s.close(); openSettings() }).catch(function () {}) })
  }

  window.OB = window.OB || {}
  window.OB.receipt = {
    version: '0.1.0',
    handle: handle,
    openSettings: openSettings,
    pairPrinter: pairPrinter,
    setTemplate: saveTemplate,
    getTemplate: loadTemplate,
  }
})()
