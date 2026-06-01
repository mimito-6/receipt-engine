import type { ZodError } from 'zod'

export interface ReceiptValidationIssue {
  /** Dot/bracket path to the offending field, e.g. `items[0].quantity`. */
  path: string
  message: string
}

/**
 * Thrown by `validateReceipt` when a receipt document fails schema validation.
 * Carries structured issues and a human-readable `format()` for CLI output.
 */
export class ReceiptValidationError extends Error {
  readonly issues: ReceiptValidationIssue[]

  constructor(issues: ReceiptValidationIssue[], message = 'Invalid receipt document') {
    super(message)
    this.name = 'ReceiptValidationError'
    this.issues = issues
    // Preserve `instanceof` across transpilation targets.
    Object.setPrototypeOf(this, ReceiptValidationError.prototype)
  }

  static fromZodError(error: ZodError): ReceiptValidationError {
    const issues = error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    }))
    return new ReceiptValidationError(issues)
  }

  /** Render issues as a readable, multi-line block for terminal output. */
  format(): string {
    if (this.issues.length === 0) return this.message
    return this.issues
      .map((issue) => `${issue.path || '(root)'}\n  ${issue.message}`)
      .join('\n\n')
  }
}

function formatPath(path: ReadonlyArray<string | number>): string {
  let out = ''
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`
    } else {
      out += out ? `.${segment}` : segment
    }
  }
  return out
}
