import { createHmac, timingSafeEqual } from 'crypto'

type SignatureParts = { ts?: string; v1?: string }

function parseSignature(value: string): SignatureParts {
  return Object.fromEntries(
    value.split(',').map((part) => {
      const [key, itemValue] = part.trim().split('=', 2)
      return [key, itemValue]
    })
  )
}

export function verifyMercadoPagoSignature({
  signature,
  requestId,
  dataId,
  secret,
}: {
  signature: string | null
  requestId: string | null
  dataId: string
  secret: string
}): boolean {
  if (!signature || !requestId || !dataId || !secret) return false
  const { ts, v1 } = parseSignature(signature)
  if (!ts || !v1) return false

  const timestamp = Number(ts)
  const timestampMs = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return false
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(v1)
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer)
}
