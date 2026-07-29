import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface MercadoPagoPayment {
  id: number | string
  status: string
  transaction_amount: number
  external_reference?: string
  pos_id?: string | number
  store_id?: string | number
  point_of_interaction?: {
    transaction_data?: {
      pos_id?: string | number
    }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params

    // 1. Find client by webhookToken
    const client = await prisma.client.findFirst({
      where: { webhookToken: token },
    })

    if (!client) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const body = await req.json().catch(() => ({}))

    // 2. Extract numerical payment ID cleanly from body
    let rawPaymentId = body?.data?.id || body?.id || body?.resource || ''
    if (typeof rawPaymentId === 'string' && rawPaymentId.includes('/')) {
      const parts = rawPaymentId.split('/')
      rawPaymentId = parts[parts.length - 1]
    }

    if (!rawPaymentId) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    // 3. Fetch full payment details from MercadoPago API using client's access token
    let payment: MercadoPagoPayment | null = null
    if (client.mpAccessToken) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${rawPaymentId}`, {
          headers: {
            Authorization: `Bearer ${client.mpAccessToken.trim()}`,
            'Content-Type': 'application/json',
          },
        })

        if (mpRes.ok) {
          payment = await mpRes.json()
        } else {
          console.warn('[webhook] MP fetch failed:', mpRes.status, await mpRes.text())
        }
      } catch (err) {
        console.error('[webhook] MP fetch error:', err)
      }
    }

    // Fallback if MP fetch failed or token not provided
    if (!payment && body?.data) {
      payment = body.data as MercadoPagoPayment
    }

    if (!payment) {
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const externalReference = payment.external_reference ?? ''
    const posId = String(
      payment.pos_id ||
      payment.point_of_interaction?.transaction_data?.pos_id ||
      ''
    )

    // 4. Find matching ESP32 for this client
    let esp32 = null

    // Match strategy A: match by Mercado Pago POS ID (mpPosId)
    if (posId) {
      esp32 = await prisma.esp32.findFirst({
        where: { mpPosId: posId, machine: { clientId: client.id } },
      })
    }

    // Match strategy B: external_reference = "esp32:{id}"
    if (!esp32 && externalReference) {
      const espMatch = externalReference.match(/^esp32:(.+)$/i)
      if (espMatch) {
        esp32 = await prisma.esp32.findFirst({
          where: { id: espMatch[1], machine: { clientId: client.id } },
        })
      }
    }

    // Match strategy C: external_reference = "idmaq:{serial}" or serialNumber directly
    if (!esp32 && externalReference) {
      const serialClean = externalReference.replace(/^idmaq:/i, '').trim().toUpperCase()
      esp32 = await prisma.esp32.findFirst({
        where: { serialNumber: serialClean, machine: { clientId: client.id } },
      })
    }

    // Match strategy D: if client has only 1 ESP32, fallback to that single ESP32
    if (!esp32) {
      const clientEsps = await prisma.esp32.findMany({
        where: { machine: { clientId: client.id } },
      })
      if (clientEsps.length === 1) {
        esp32 = clientEsps[0]
      }
    }

    if (!esp32) {
      console.warn(`[webhook] No matching ESP32 found for client ${client.id}, ref: "${externalReference}", posId: "${posId}"`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const isApproved = String(payment.status).toLowerCase() === 'approved'

    // 5. If payment is approved, credit ESP32 & publish MQTT
    if (isApproved) {
      const mpPayIdStr = String(payment.id || rawPaymentId)

      // Prevent duplicate payment processing
      const existingPay = await prisma.payment.findUnique({ where: { mpPaymentId: mpPayIdStr } })
      if (!existingPay) {
        await prisma.payment.create({
          data: {
            clientId: client.id,
            esp32Id: esp32.id,
            mpPaymentId: mpPayIdStr,
            amount: payment.transaction_amount || 0,
            status: 'approved',
            externalRef: externalReference || posId,
          },
        })

        // Increment ESP32 credit and touch lastSeen / online
        await prisma.esp32.update({
          where: { id: esp32.id },
          data: {
            credits: { increment: payment.transaction_amount || 0 },
            online: true,
            lastSeen: new Date(),
          },
        })

        // Publish to MQTT to release credit on physical machine
        try {
          await fetch('https://apimqtt.adapterco.com.br/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              topic: esp32.mqttTopic,
              message: JSON.stringify({
                action: 'credit',
                amount: payment.transaction_amount,
                paymentId: mpPayIdStr,
                serialNumber: esp32.serialNumber,
              }),
            }),
          })
        } catch (mqttErr) {
          console.error('[webhook] MQTT publish failed:', mqttErr)
        }
      }
    }

    // 6. Log TelemetryEvent for real-time telemetry screen
    await prisma.telemetryEvent.create({
      data: {
        esp32Id: esp32.id,
        type: 'payment',
        payload: JSON.stringify({
          mpPaymentId: payment.id || rawPaymentId,
          status: payment.status,
          amount: payment.transaction_amount,
          posId,
          idmaq: esp32.serialNumber,
        }),
      },
    })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('[webhook] Error processing notification:', error)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
