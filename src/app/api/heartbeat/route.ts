import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateDevice } from '@/lib/device-auth'
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit'
import { z } from 'zod'

const heartbeatSchema = z.object({
  idmaq: z.string().trim().min(1).max(64).optional(),
  serialNumber: z.string().trim().min(1).max(64).optional(),
}).strict().refine((data) => data.idmaq || data.serialNumber)

// POST /api/heartbeat
// Heartbeat endpoint for ESP32 devices to report online status
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
    const { idmaq, serialNumber } = parsed.data
    const target = String(idmaq || serialNumber || '').trim().toUpperCase()

    if (!target) {
      return NextResponse.json({ error: 'idmaq is required' }, { status: 400 })
    }

    const esp32 = await authenticateDevice(req, target)

    if (!esp32) {
      return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 })
    }

    const updated = await prisma.esp32.update({
      where: { id: esp32.id },
      data: {
        lastSeen: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      idmaq: target,
      online: true,
      lastSeen: updated.lastSeen,
    })
  } catch (err) {
    console.error('[heartbeat POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'AdapterHub Heartbeat API Active' })
}
