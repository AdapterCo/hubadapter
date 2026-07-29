import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/crypto'
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
  store_id?: string | number
  collector_id?: number
  point_of_interaction?: {
    device?: {
      serial_number?: string
      model?: string
    }
    transaction_data?: {
      pos_id?: string | number
    }
  }
}

function extractPaymentId(req: NextRequest, body: any): string {
  let val = body?.data?.id || body?.id || body?.resource || ''
  if (!val) {
    const url = new URL(req.url)
    val =
      url.searchParams.get('id') ||
      url.searchParams.get('data.id') ||
      url.searchParams.get('resource') ||
      ''
  }
  if (typeof val === 'string' && val.includes('/')) {
    val = val.split('/').pop() || ''
  }
  return String(val).trim()
}

async function handleNotification(
  req: NextRequest,
  token: string,
  body: any
) {
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

    const rawPaymentId = extractPaymentId(req, body)
    if (!rawPaymentId) {
      return NextResponse.json({ ok: true, message: 'No payment ID found' }, { status: 200 })
    }

    // 1. Anti-Replay Protection: Check if this paymentId was already processed
    const existingPayment = await prisma.payment.findUnique({
      where: { mpPaymentId: rawPaymentId },
      select: { id: true },
    })

    if (existingPayment) {
      return NextResponse.json({ ok: true, message: 'Payment already processed' }, { status: 200 })
    }

    // 2. Validate signature if present (Webhook v2 mode)
    const signature = req.headers.get('x-signature')
    const webhookSecret = decryptSecret(client.mpWebhookSecret)

    if (signature && webhookSecret) {
      const isValidSig = verifyMercadoPagoSignature({
        signature,
        requestId: req.headers.get('x-request-id'),
        dataId: rawPaymentId.toLowerCase(),
        secret: webhookSecret,
      })

      if (!isValidSig) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
      }
    }

    // 3. Get client's Mercado Pago Access Token
    const accessToken = decryptSecret(client.mpAccessToken)
    if (!accessToken) {
      return NextResponse.json({ error: 'Mercado Pago token is not configured' }, { status: 409 })
    }

    // 4. Secure Verification: Query official Mercado Pago API directly using the client's token
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
      console.error('[webhook/IPN] Mercado Pago API query failed', {
        status: mpResponse.status,
        paymentId: rawPaymentId,
        clientId: client.id,
      })
      return NextResponse.json({ error: 'Payment validation failed at Mercado Pago' }, { status: 502 })
    }

    await prisma.client.update({
      where: { id: client.id },
      data: { mpTokenValid: true, mpTokenCheckedAt: new Date() },
    })

    const payment = (await mpResponse.json()) as MercadoPagoPayment
    const mpPaymentId = String(payment.id)

    // 5. Strict Payment Validation: status must be approved, BRL currency, amount > 0
    if (
      mpPaymentId !== rawPaymentId ||
      payment.status.toLowerCase() !== 'approved' ||
      payment.currency_id !== 'BRL' ||
      !Number.isFinite(payment.transaction_amount) ||
      payment.transaction_amount <= 0
    ) {
      return NextResponse.json({ ok: true, message: 'Payment status not approved or non-BRL' }, { status: 200 })
    }

    const externalReference = String(payment.external_reference || '').trim()
    const posId = String(
      payment.pos_id ||
      payment.point_of_interaction?.transaction_data?.pos_id ||
      payment.store_id ||
      ''
    ).trim()
    const deviceSerial = String(
      payment.point_of_interaction?.device?.serial_number || ''
    ).trim()

    // 6. Match Payment to ESP32 device using 4 lookup strategies:
    // Strategy A: Match by posId (e.g. "135916764") in mpPosId or mpPosName
    let esp32 = posId
      ? await prisma.esp32.findFirst({
          where: {
            machine: { clientId: client.id },
            OR: [{ mpPosId: posId }, { mpPosName: posId }],
          },
        })
      : null

    // Strategy B: Match by device serial_number (e.g. "Q92-1733238464") from point_of_interaction.device
    if (!esp32 && deviceSerial) {
      esp32 = await prisma.esp32.findFirst({
        where: {
          machine: { clientId: client.id },
          OR: [{ mpPosId: deviceSerial }, { mpPosName: deviceSerial }],
        },
      })
    }

    // Strategy C: Match by externalReference (e.g. "ADP-001" or "esp32:cuid")
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

    // Strategy D: Fallback for 1-ESP32 Clients (If client has only 1 ESP32, credit it!)
    if (!esp32) {
      const clientEsps = await prisma.esp32.findMany({
        where: { machine: { clientId: client.id } },
        take: 2,
      })
      if (clientEsps.length === 1) {
        esp32 = clientEsps[0]
      }
    }

    if (!esp32) {
      await prisma.webhookIssue.create({
        data: {
          clientId: client.id,
          paymentId: mpPaymentId,
          reason: `Pagamento aprovado sem ESP32 associado (POS: ${posId || 'N/A'}, Serial MP: ${deviceSerial || 'N/A'})`,
          posId: posId || deviceSerial || null,
          externalReference: externalReference || null,
        },
      })
      console.warn('[webhook/IPN] Payment could not be associated to an ESP32', {
        paymentId: mpPaymentId,
        clientId: client.id,
        posId,
        deviceSerial,
        externalReference,
      })
      return NextResponse.json({ error: 'Payment device not found' }, { status: 422 })
    }

    const amount = new Prisma.Decimal(payment.transaction_amount).toDecimalPlaces(2)
    const amountText = amount.toFixed(2)
    const action = 'credit'
    const payload = JSON.stringify({
      action,
      amount: Number(amountText),
      paymentId: mpPaymentId,
      serialNumber: esp32.serialNumber,
    })

    // 7. Atomic Transaction: Record Payment, Increment ESP32 Credits, Queue Outbox MQTT Message
    await prisma.$transaction(async (tx) => {
      const doubleCheck = await tx.payment.findUnique({
        where: { mpPaymentId },
        select: { id: true },
      })
      if (doubleCheck) return

      const storedPayment = await tx.payment.create({
        data: {
          clientId: client.id,
          esp32Id: esp32.id,
          mpPaymentId,
          amount,
          status: 'approved',
          externalRef: externalReference || posId || deviceSerial || 'direct-pos',
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
            posId: posId || deviceSerial,
            idmaq: esp32.serialNumber,
          }),
        },
      })
    })

    // Immediately trigger outbox worker batch to publish MQTT credit to ESP32
    await processOutboxBatch(5)
    return NextResponse.json({ ok: true, paymentId: mpPaymentId }, { status: 200 })
  } catch (error) {
    console.error('[webhook/IPN] Error processing notification', error)
    return NextResponse.json({ error: 'Temporary processing failure' }, { status: 500 })
  }
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

  const body: unknown = await req.json().catch(() => null)
  return handleNotification(req, token, body)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  return handleNotification(req, token, {})
}
