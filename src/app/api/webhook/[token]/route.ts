import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/crypto'
import { refundMercadoPagoPayment } from '@/lib/mercadopago'
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit'

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
  payment_method_id?: string
  payment_type_id?: string
  payment_method?: {
    id?: string
    type?: string
  }
  point_of_interaction?: {
    device?: {
      serial_number?: string
      model?: string
      manufacturer?: string
    }
    transaction_data?: {
      pos_id?: string | number
    }
  }
}

function parsePaymentMethod(payment: MercadoPagoPayment): string {
  const methodId = String(payment.payment_method_id || payment.payment_method?.id || '').toLowerCase()
  const typeId = String(payment.payment_type_id || payment.payment_method?.type || '').toLowerCase()

  if (methodId.includes('pix') || typeId.includes('bank_transfer')) return 'Pix'
  if (typeId.includes('debit') || methodId.includes('debit')) return 'Cartão de Débito'
  if (typeId.includes('credit') || methodId.includes('credit') || methodId.includes('visa') || methodId.includes('master') || methodId.includes('elo')) return 'Cartão de Crédito'
  if (methodId) return methodId.toUpperCase()
  return 'Pix / Cartão'
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

async function parseRequestBody(req: NextRequest): Promise<any> {
  const contentType = req.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      return await req.json()
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const params = new URLSearchParams(text)
      return Object.fromEntries(params.entries())
    }
    const text = await req.text()
    if (!text) return null
    try {
      return JSON.parse(text)
    } catch {
      if (text.includes('=')) {
        return Object.fromEntries(new URLSearchParams(text).entries())
      }
      return { rawText: text }
    }
  } catch {
    return null
  }
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
    console.warn(`[webhook RECV] Rate limit exceeded for token ${token}`)
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  console.log('[webhook RECV]', {
    method: req.method,
    url: req.url,
    contentType: req.headers.get('content-type'),
    body,
  })

  try {
    const client = await prisma.client.findUnique({
      where: { webhookToken: token },
      select: {
        id: true,
        active: true,
        mpAccessToken: true,
      },
    })

    if (!client?.active) {
      console.warn(`[webhook RECV] Inactive or non-existent client for token: ${token}`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const rawPaymentId = extractPaymentId(req, body)
    if (!rawPaymentId) {
      console.warn('[webhook RECV] No payment ID extracted from request', { url: req.url, body })
      return NextResponse.json({ ok: true, message: 'No payment ID found' }, { status: 200 })
    }

    console.log(`[webhook RECV] Extracted payment ID: ${rawPaymentId} for client: ${client.id}`)

    // 1. Anti-Replay Protection: Check if this paymentId was already processed
    const existingPayment = await prisma.payment.findUnique({
      where: { mpPaymentId: rawPaymentId },
      select: { id: true, status: true },
    })

    if (existingPayment) {
      console.log(`[webhook RECV] Payment ${rawPaymentId} already processed previously (Status: ${existingPayment.status})`)
      return NextResponse.json({ ok: true, message: 'Payment already processed' }, { status: 200 })
    }

    // 2. Get client's Mercado Pago Access Token
    const accessToken = decryptSecret(client.mpAccessToken)
    if (!accessToken) {
      console.warn(`[webhook RECV] Client ${client.id} has no mpAccessToken configured`)
      return NextResponse.json({ error: 'Mercado Pago token is not configured' }, { status: 409 })
    }

    // 3. 100% Official Verification: Query Mercado Pago API directly using client's Access Token
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
      console.error('[webhook RECV] Mercado Pago API query failed', {
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
    const paymentMethodName = parsePaymentMethod(payment)

    // 4. Strict Payment Validation: status must be approved, BRL currency, amount >= 1.00
    if (
      mpPaymentId !== rawPaymentId ||
      payment.status.toLowerCase() !== 'approved' ||
      payment.currency_id !== 'BRL' ||
      !Number.isFinite(payment.transaction_amount) ||
      payment.transaction_amount < 1.0
    ) {
      console.log(`[webhook RECV] Payment ${mpPaymentId} status: ${payment.status}, amount: ${payment.transaction_amount} (Requires >= 1.00 BRL)`)
      return NextResponse.json({ ok: true, message: 'Payment status not approved or amount < 1.00 BRL' }, { status: 200 })
    }

    // 5. REQUIREMENT 1: Floor / Integer Credits (ex: 1.02 -> 1 credit, cents discarded)
    const rawAmount = payment.transaction_amount
    const creditsToGrant = Math.floor(rawAmount) // Discards cents (e.g. 1.02 -> 1)

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

    // Fetch all ESP32 devices belonging to this client to perform precise terminal matching
    const clientEsps = await prisma.esp32.findMany({
      where: { machine: { clientId: client.id } },
    })

    let esp32 = null

    // Strategy A: Match by Terminal Serial Number (deviceSerial, e.g. "Q92-1733238464" inside "PAX_Q92__Q92-1733238464")
    if (deviceSerial) {
      esp32 = clientEsps.find(e =>
        e.mpPosId?.toLowerCase().includes(deviceSerial.toLowerCase()) ||
        e.mpPosName?.toLowerCase().includes(deviceSerial.toLowerCase())
      ) || null
    }

    // Strategy B: Match by Terminal ID or POS ID (posId, e.g. "135916764")
    if (!esp32 && posId) {
      esp32 = clientEsps.find(e =>
        e.mpPosId?.toLowerCase() === posId.toLowerCase() ||
        e.mpPosName?.toLowerCase() === posId.toLowerCase()
      ) || null
    }

    // Strategy C: Match by External Reference (IDMAQ, e.g. "ADP-001")
    if (!esp32 && externalReference) {
      const serial = externalReference.replace(/^(idmaq|esp32):/i, '').trim().toUpperCase()
      esp32 = clientEsps.find(e => e.serialNumber.toUpperCase() === serial || e.id === serial) || null
    }

    // Strategy D: Fallback for 1-ESP32 Clients (If client has exactly 1 ESP32, credit it!)
    if (!esp32 && clientEsps.length === 1) {
      esp32 = clientEsps[0]
    }

    if (!esp32) {
      await prisma.webhookIssue.create({
        data: {
          clientId: client.id,
          paymentId: mpPaymentId,
          reason: `Pagamento aprovado sem ESP32 associado (Terminal Serial: ${deviceSerial || 'N/A'}, POS ID: ${posId || 'N/A'})`,
          posId: deviceSerial || posId || null,
          externalReference: externalReference || null,
        },
      })
      console.warn('[webhook RECV] Payment could not be associated to an ESP32', {
        paymentId: mpPaymentId,
        clientId: client.id,
        deviceSerial,
        posId,
        externalReference,
      })
      return NextResponse.json({ error: 'Payment device not found' }, { status: 422 })
    }

    // 6. SYNCHRONOUS END-TO-END ACK VERIFICATION:
    // Send MQTT credit payload directly to ESP32 topic & wait up to 4.5 seconds for HTTP ACK from ESP32!
    const payload = JSON.stringify({
      action: 'credit',
      amount: creditsToGrant,
      paymentId: mpPaymentId,
      serialNumber: esp32.serialNumber,
    })

    console.log(`[webhook RECV] Direct MQTT credit dispatching to topic [${esp32.mqttTopic}] for payment ${mpPaymentId}...`)

    // Publish MQTT credit message immediately
    await fetch(process.env.MQTT_API_URL || 'https://apimqtt.adapterco.com.br/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: esp32.mqttTopic, message: payload }),
      signal: AbortSignal.timeout(5_000),
    }).catch((err) => {
      console.warn('[webhook RECV] MQTT publish warning:', err)
    })

    // Poll DB for up to 4.5 seconds to verify if ESP32 ACK arrived for this paymentId
    let ackReceived = false
    const ackDeadline = Date.now() + 4500

    while (Date.now() < ackDeadline) {
      await new Promise(r => setTimeout(r, 300))
      const checkEsp = await prisma.esp32.findUnique({
        where: { id: esp32.id },
        select: { lastAckPaymentId: true, lastAckAt: true },
      })
      if (
        checkEsp?.lastAckPaymentId === mpPaymentId &&
        checkEsp?.lastAckAt &&
        Date.now() - new Date(checkEsp.lastAckAt).getTime() <= 6000
      ) {
        ackReceived = true
        break
      }
    }

    // 7. IF ESP32 DID NOT ACKNOWLEDGE (Unplugged/Offline/Unreachable) -> INSTANT AUTO-REFUND!
    if (!ackReceived) {
      console.warn(`[webhook RECV] ❌ END-TO-END ACK TIMEOUT! ESP32 ${esp32.serialNumber} failed to acknowledge payment ${mpPaymentId}. Executing instant auto-refund...`)

      const refundResult = await refundMercadoPagoPayment({
        paymentId: mpPaymentId,
        accessToken,
      })

      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            clientId: client.id,
            esp32Id: esp32.id,
            mpPaymentId,
            amount: new Prisma.Decimal(rawAmount),
            status: 'refunded',
            paymentMethod: paymentMethodName,
            externalRef: externalReference || deviceSerial || posId || 'auto-refund-no-ack',
          },
        })

        await tx.telemetryEvent.create({
          data: {
            esp32Id: esp32.id,
            type: 'refund',
            payload: JSON.stringify({
              mpPaymentId,
              status: 'refunded',
              amount: rawAmount,
              paymentMethod: paymentMethodName,
              reason: 'ESP32 não confirmou o recebimento da mensagem (sem resposta ponta a ponta). Pagamento estornado automaticamente.',
              refundResult,
              idmaq: esp32.serialNumber,
            }),
          },
        })
      })

      console.log(`[webhook RECV] 💸 INSTANT REFUND COMPLETE! Payment ${mpPaymentId} refunded via Mercado Pago. ESP32 ${esp32.serialNumber} was unreachable.`)
      return NextResponse.json({
        ok: true,
        message: 'ESP32 did not acknowledge credit delivery. Payment refunded automatically.',
        refunded: true,
      }, { status: 200 })
    }

    // 8. ESP32 ACKNOWLEDGED RECEPTION (END-TO-END CONFIRMED): Record Payment, Increment Credits & Telemetry
    const amountDecimal = new Prisma.Decimal(creditsToGrant)

    await prisma.$transaction(async (tx) => {
      const doubleCheck = await tx.payment.findUnique({
        where: { mpPaymentId },
        select: { id: true },
      })
      if (doubleCheck) return

      await tx.payment.create({
        data: {
          clientId: client.id,
          esp32Id: esp32.id,
          mpPaymentId,
          amount: amountDecimal,
          status: 'approved',
          paymentMethod: paymentMethodName,
          externalRef: externalReference || deviceSerial || posId || 'terminal-pos',
        },
      })

      await tx.esp32.update({
        where: { id: esp32.id },
        data: {
          credits: { increment: amountDecimal },
          lastSeen: new Date(),
        },
      })

      await tx.telemetryEvent.create({
        data: {
          esp32Id: esp32.id,
          type: 'payment',
          payload: JSON.stringify({
            mpPaymentId,
            status: payment.status,
            paidAmount: rawAmount,
            creditedAmount: creditsToGrant,
            paymentMethod: paymentMethodName,
            terminalSerial: deviceSerial || posId,
            idmaq: esp32.serialNumber,
            ackConfirmed: true,
          }),
        },
      })
    })

    console.log(`[webhook RECV] 🎉 END-TO-END ACK CONFIRMED! Payment ${mpPaymentId} (R$ ${rawAmount} via ${paymentMethodName}) credited ${creditsToGrant} credit(s) to ESP32 ${esp32.serialNumber}`)

    return NextResponse.json({ ok: true, paymentId: mpPaymentId, credits: creditsToGrant, ack: true }, { status: 200 })
  } catch (error) {
    console.error('[webhook RECV] Error processing notification', error)
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

  const body = await parseRequestBody(req)
  return handleNotification(req, token, body)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  return handleNotification(req, token, {})
}
