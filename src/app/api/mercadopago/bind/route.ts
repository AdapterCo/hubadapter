import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { esp32Id, mpPosId, mpPosName } = await req.json()

    if (!esp32Id) {
      return NextResponse.json({ error: 'esp32Id é obrigatório' }, { status: 400 })
    }

    // Verify esp32 belongs to the client
    const esp32 = await prisma.esp32.findFirst({
      where: {
        id: esp32Id,
        machine: { clientId: session.user.id },
      },
    })

    if (!esp32) {
      return NextResponse.json({ error: 'ESP32 não encontrado ou não pertence a esta conta' }, { status: 404 })
    }

    // Update esp32 with Mercado Pago POS info
    const updated = await prisma.esp32.update({
      where: { id: esp32Id },
      data: {
        mpPosId: mpPosId || null,
        mpPosName: mpPosName || null,
      },
      select: {
        id: true,
        serialNumber: true,
        mqttTopic: true,
        online: true,
        lastSeen: true,
        credits: true,
        mpPosId: true,
        mpPosName: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      esp32: { ...updated, credits: Number(updated.credits) },
    })
  } catch (error) {
    console.error('[mercadopago/bind POST]', error)
    return NextResponse.json({ error: 'Erro interno ao vincular máquina de cartão' }, { status: 500 })
  }
}
