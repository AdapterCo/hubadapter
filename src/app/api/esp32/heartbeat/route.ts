import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// POST /api/esp32/heartbeat
// Called by ESP32 devices or MQTT bridge to report device online status
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { idmaq, serialNumber } = body
    const target = (idmaq || serialNumber || '').trim().toUpperCase()

    if (!target) {
      return NextResponse.json({ error: 'idmaq or serialNumber is required' }, { status: 400 })
    }

    const esp32 = await prisma.esp32.findFirst({
      where: { serialNumber: target },
    })

    if (!esp32) {
      return NextResponse.json({ error: 'ESP32 not found' }, { status: 404 })
    }

    const updated = await prisma.esp32.update({
      where: { id: esp32.id },
      data: {
        online: true,
        lastSeen: new Date(),
      },
    })

    return NextResponse.json({ success: true, idmaq: target, online: true, lastSeen: updated.lastSeen })
  } catch (err) {
    console.error('[esp32/heartbeat POST]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
