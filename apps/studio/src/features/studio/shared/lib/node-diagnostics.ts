const sensitiveKey = /(api.?key|credential|secret|token|authorization|password|cookie)/i
const credentialValue = /\b(?:sk-[A-Za-z0-9_-]{8,}|r8_[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})\b/g

export function redactDiagnosticData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticData(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[redacted]' : redactDiagnosticData(item),
      ]),
    )
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:')) return '[inline media omitted]'
    if (/^https?:\/\//i.test(value)) return '[external URL omitted]'
    return value
      .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
      .replace(/(api[_-]?key|token|authorization)(["'\s:=]+)[^\s,"'<>}]+/gi, '$1$2[redacted]')
      .replace(credentialValue, '[credential]')
  }
  return value
}
