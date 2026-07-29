import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyMercadoPagoSignature } from './mercadopago'

describe('Mercado Pago webhook signature', () => {
  it('accepts a current valid HMAC signature', () => {
    const dataId = '123'
    const requestId = 'request-1'
    const secret = 'webhook-secret'
    const ts = String(Math.floor(Date.now() / 1000))
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const signature = createHmac('sha256', secret).update(manifest).digest('hex')

    expect(
      verifyMercadoPagoSignature({
        signature: `ts=${ts},v1=${signature}`,
        requestId,
        dataId,
        secret,
      })
    ).toBe(true)
  })

  it('rejects an invalid signature', () => {
    expect(
      verifyMercadoPagoSignature({
        signature: `ts=${Date.now()},v1=invalid`,
        requestId: 'request-1',
        dataId: '123',
        secret: 'webhook-secret',
      })
    ).toBe(false)
  })
})
