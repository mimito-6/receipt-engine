#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { safeValidateReceipt } from '@receipt-engine/core'
import { renderReceiptToHtml } from '@receipt-engine/render-html'
import { renderReceiptToPng } from '@receipt-engine/render-png'
import { renderReceiptToSvg } from '@receipt-engine/render-svg'
import { resolveAssets } from './resolveAssets'

const FORMATS = ['svg', 'html', 'png'] as const
const THEMES = ['custom', 'thermal'] as const
type Format = (typeof FORMATS)[number]
type ThemeName = (typeof THEMES)[number]

/**
 * The directory the user invoked from. Under `pnpm`/`npm` scripts the process
 * cwd is the package dir, but `INIT_CWD` holds the original working directory,
 * so relative input/output paths resolve as the user expects.
 */
const baseCwd = process.env.INIT_CWD ?? process.cwd()

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

function printUsage(): void {
  console.log(`receipt-engine — render receipt JSON to SVG / HTML / PNG

Usage:
  receipt-engine render <file> [options]

Options:
  --theme <custom|thermal>         Theme to render with (default: custom)
  --format <svg|html|png>          Output format (default: svg)
  --out <path>                     Write to a file (required for png; svg/html
                                   print to stdout when omitted)
  --width <number>                 Override the receipt width in px
  --pretty                         Human-readable SVG output
  -h, --help                       Show this help

Examples:
  receipt-engine render receipt.json --theme custom --format png --out receipt.png
  receipt-engine render receipt.json --theme thermal --format svg --out receipt.svg`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      theme: { type: 'string' },
      format: { type: 'string' },
      out: { type: 'string' },
      width: { type: 'string' },
      pretty: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })

  const [command, file] = positionals

  if (values.help || !command) {
    printUsage()
    process.exit(0)
  }
  if (command !== 'render') {
    fail(`Unknown command: ${command}\nRun "receipt-engine --help" for usage.`)
  }
  if (!file) {
    fail('Missing input file.\nUsage: receipt-engine render <file> [options]')
  }

  // Validate option values up front for clean error messages.
  const themeName = (values.theme ?? 'custom') as ThemeName
  if (!THEMES.includes(themeName)) {
    fail(`Unsupported theme: ${values.theme}\nSupported themes: ${THEMES.join(', ')}`)
  }
  const format = (values.format ?? 'svg') as Format
  if (!FORMATS.includes(format)) {
    fail(`Unsupported format: ${values.format}\nSupported formats: ${FORMATS.join(', ')}`)
  }
  let width: number | undefined
  if (values.width !== undefined) {
    width = Number(values.width)
    if (!Number.isFinite(width) || width <= 0) fail(`Invalid --width: ${values.width}`)
  }

  // Read + parse JSON.
  const inputPath = resolve(baseCwd, file)
  let raw: string
  try {
    raw = readFileSync(inputPath, 'utf8')
  } catch {
    return fail(`Cannot read file: ${file}`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    console.error('✗ Failed to parse JSON')
    console.error((error as Error).message)
    process.exit(1)
  }

  // Validate against the receipt schema.
  const result = safeValidateReceipt(json)
  if (!result.success || !result.data) {
    console.error('✗ Invalid receipt document\n')
    console.error(result.error?.format() ?? 'Unknown validation error')
    process.exit(1)
  }

  // Inline local images relative to the JSON file's folder.
  const { receipt, warnings } = resolveAssets(result.data, dirname(inputPath))
  for (const warning of warnings) console.error(`! ${warning}`)

  // Render.
  let output: string | Buffer
  try {
    if (format === 'svg') {
      let svg = renderReceiptToSvg(receipt, { theme: themeName, width, includeXmlDeclaration: true })
      if (values.pretty) svg = svg.replace(/></g, '>\n<')
      output = svg
    } else if (format === 'html') {
      output = renderReceiptToHtml(receipt, { theme: themeName, width })
    } else {
      output = await renderReceiptToPng(receipt, { theme: themeName, width })
    }
  } catch (error) {
    return fail((error as Error).message)
  }

  // Write or stream.
  if (format === 'png' && !values.out) {
    return fail('PNG output requires --out <path>')
  }
  if (values.out) {
    const outPath = resolve(baseCwd, values.out)
    if (typeof output === 'string') writeFileSync(outPath, output, 'utf8')
    else writeFileSync(outPath, output)
    console.log(`✓ Receipt rendered`)
    console.log(`Input: ${file}`)
    console.log(`Theme: ${themeName}`)
    console.log(`Format: ${format}`)
    console.log(`Output: ${values.out}`)
  } else {
    process.stdout.write(output as string)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
