import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit'
import { z } from 'zod'

const heartbeatSchema = z.object({
  idmaq: z.string().trim().min(1).max(64).optional(),
  serialNumber: z.string().trim().min(1).max(64).optional(),
  paymentId: z.string().trim().max(128).optional(),
  ack: z.boolean().optional(),
}).strict().refine((data) => data.idmaq || data.serialNumber)

// POST /api/heartbeat
// Heartbeat & Synchronous Payment ACK endpoint for ESP32 devices
export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length') || 0) > 4 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    const rateLimit = checkRateLimit(`heartbeat:${getRequestIp(req)}`, 180, 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
      )
    }

    const parsed = heartbeatSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid heartbeat payload' }, { status: 400 })
    }
    const { idmaq, serialNumber, paymentId, ack } = parsed.data
    const target = String(idmaq || serialNumber || '').trim().toUpperCase()

    if (!target) {
      return NextResponse.json({ error: 'idmaq is required' }, { status: 400 })
    }

    const esp32 = await prisma.esp32.findUnique({
      where: { serialNumber: target },
    })

    if (!esp32) {
      return NextResponse.json({ error: 'ESP32 not found' }, { status: 404 })
    }

    const updateData: {
      lastSeen: Date
      lastAckPaymentId?: string
      lastAckAt?: Date
    } = {
      lastSeen: new Date(),
    }

    if (paymentId || ack) {
      updateData.lastAckPaymentId = paymentId ? String(paymentId) : 'ack'
      updateData.lastAckAt = new Date()
      console.log(`[heartbeat ACK] ESP32 ${target} acknowledged payment: ${paymentId}`)
    }

    const updated = await prisma.esp32.update({
      where: { id: esp32.id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      idmaq: target,
      online: true,
      lastSeen: updated.lastSeen,
      lastAckPaymentId: updated.lastAckPaymentId,
    })
  } catch (err) {
    console.error('[heartbeat POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'AdapterHub Heartbeat API Active' })
}
