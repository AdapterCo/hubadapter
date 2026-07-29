import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decryptSecret, signCommand } from '@/lib/crypto'
import { verifyMercadoPagoSignature } from '@/lib/mercadopago'
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit'
import { processOutboxBatch } from '@/lib/outbox'

export const dynamic = 'force-dynamic'

interface MercadoPagoPayment {
  id: number | string
  status: string
  transaction_amount: number
  currency_id: string
  external_reference?: string
  pos_id?: string | number
  point_of_interaction?: {
    transaction_data?: {
      pos_id?: string | number
    }
  }
}

interface MercadoPagoNotification {
  data?: { id?: string | number }
  id?: string | number
  resource?: string
}

function paymentIdFromBody(body: MercadoPagoNotification): string {
  let value = body?.data?.id || body?.id || body?.resource || ''
  if (typeof value === 'string' && value.includes('/')) {
    value = value.split('/').pop() || ''
  }
  return String(value).trim()
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > 64 * 1024) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const rateLimit = checkRateLimit(
    `webhook:${token}:${getRequestIp(req)}`,
    120,
    60 * 1000
  )
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const client = await prisma.client.findUnique({
      where: { webhookToken: token },
      select: {
        id: true,
        active: true,
        mpAccessToken: true,
        mpWebhookSecret: true,
      },
    })

    if (!client?.active) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const rawPaymentId = paymentIdFromBody(body as MercadoPagoNotification)
    if (!rawPaymentId) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const webhookSecret = decryptSecret(client.mpWebhookSecret)
    if (
      !webhookSecret ||
      !verifyMercadoPagoSignature({
        signature: req.headers.get('x-signature'),
        requestId: req.headers.get('x-request-id'),
        dataId: rawPaymentId.toLowerCase(),
        secret: webhookSecret,
      })
    ) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    const accessToken = decryptSecret(client.mpAccessToken)
    if (!accessToken) {
      return NextResponse.json({ error: 'Mercado Pago token is not configured' }, { status: 409 })
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(rawPaymentId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (!mpResponse.ok) {
      if (mpResponse.status === 401 || mpResponse.status === 403) {
        await prisma.client.update({
          where: { id: client.id },
          data: { mpTokenValid: false, mpTokenCheckedAt: new Date() },
        })
      }
      console.error('[webhook] Mercado Pago validation failed', {
        status: mpResponse.status,
        paymentId: rawPaymentId,
        clientId: client.id,
      })
      return NextResponse.json({ error: 'Payment validation failed' }, { status: 502 })
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { mpTokenValid: true, mpTokenCheckedAt: new Date() },
    })
    const payment = (await mpResponse.json()) as MercadoPagoPayment
    if (
      String(payment.id) !== rawPaymentId ||
      payment.status.toLowerCase() !== 'approved' ||
      payment.currency_id !== 'BRL' ||
      !Number.isFinite(payment.transaction_amount) ||
      payment.transaction_amount <= 0
    ) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const externalReference = String(payment.external_reference || '').trim()
    const posId = String(
      payment.pos_id ||
      payment.point_of_interaction?.transaction_data?.pos_id ||
      ''
    ).trim()

    let esp32 = posId
      ? await prisma.esp32.findFirst({
          where: { mpPosId: posId, machine: { clientId: client.id } },
        })
      : null

    if (!esp32 && externalReference) {
      const espMatch = externalReference.match(/^esp32:(.+)$/i)
      if (espMatch) {
        esp32 = await prisma.esp32.findFirst({
          where: { id: espMatch[1], machine: { clientId: client.id } },
        })
      }
    }

    if (!esp32 && externalReference) {
      const serial = externalReference.replace(/^idmaq:/i, '').trim().toUpperCase()
      esp32 = await prisma.esp32.findFirst({
        where: { serialNumber: serial, machine: { clientId: client.id } },
      })
    }

    if (!esp32 || (!posId && !externalReference)) {
      await prisma.webhookIssue.create({
        data: {
          clientId: client.id,
          paymentId: rawPaymentId,
          reason: 'Pagamento aprovado sem dispositivo associado',
          posId: posId || null,
          externalReference: externalReference || null,
        },
      })
      console.warn('[webhook] Payment could not be associated', {
        paymentId: rawPaymentId,
        clientId: client.id,
        posId,
        externalReference,
      })
      return NextResponse.json({ error: 'Payment device not found' }, { status: 422 })
    }

    const commandSecret = decryptSecret(esp32.commandSecret)
    if (!commandSecret) {
      return NextResponse.json({ error: 'Device is not securely provisioned' }, { status: 409 })
    }

    const amount = new Prisma.Decimal(payment.transaction_amount).toDecimalPlaces(2)
    const amountText = amount.toFixed(2)
    const mpPaymentId = String(payment.id)
    const action = 'credit'
    const payload = JSON.stringify({
      action,
      amount: Number(amountText),
      paymentId: mpPaymentId,
      serialNumber: esp32.serialNumber,
      signature: signCommand(commandSecret, action, amountText, mpPaymentId),
    })

    await prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({
        where: { mpPaymentId },
        select: { id: true },
      })
      if (existing) return

      const storedPayment = await tx.payment.create({
        data: {
          clientId: client.id,
          esp32Id: esp32.id,
          mpPaymentId,
          amount,
          status: 'approved',
          externalRef: externalReference || posId,
        },
      })

      await tx.esp32.update({
        where: { id: esp32.id },
        data: {
          credits: { increment: amount },
          lastSeen: new Date(),
        },
      })

      await tx.outboxMessage.create({
        data: {
          paymentId: storedPayment.id,
          esp32Id: esp32.id,
          topic: esp32.mqttTopic,
          payload,
        },
      })

      await tx.telemetryEvent.create({
        data: {
          esp32Id: esp32.id,
          type: 'payment',
          payload: JSON.stringify({
            mpPaymentId,
            status: payment.status,
            amount: Number(amountText),
            posId,
            idmaq: esp32.serialNumber,
          }),
        },
      })
    })

    await processOutboxBatch(5)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[webhook] Error processing notification', error)
    return NextResponse.json({ error: 'Temporary processing failure' }, { status: 500 })
  }
}
