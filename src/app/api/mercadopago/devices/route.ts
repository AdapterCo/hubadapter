import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface MpPosDevice {
  id: string
  name: string
  pos_id?: string
  store_id?: string
  operating_mode?: string
  external_id?: string
  model?: string
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Securely retrieve client's MP access token from database
    const client = await prisma.client.findUnique({
      where: { id: session.user.id },
      select: { mpAccessToken: true },
    })

    if (!client?.mpAccessToken) {
      return NextResponse.json(
        {
          error: 'Access Token do Mercado Pago não configurado. Por favor, cadastre seu token em Configurações.',
          needsConfig: true,
        },
        { status: 400 }
      )
    }

    const token = client.mpAccessToken.trim()
    const devicesList: MpPosDevice[] = []
    const seenIds = new Set<string>()

    // 1. Fetch from Mercado Pago POS API
    try {
      const posRes = await fetch('https://api.mercadopago.com/pos', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (posRes.ok) {
        const posData = await posRes.json()
        const items = posData?.results || (Array.isArray(posData) ? posData : [])
        for (const item of items) {
          const deviceId = String(item.id || item.pos_id || item.external_id)
          if (deviceId && !seenIds.has(deviceId)) {
            seenIds.add(deviceId)
            devicesList.push({
              id: deviceId,
              name: item.name || `Máquina POS #${deviceId}`,
              pos_id: item.id ? String(item.id) : undefined,
              store_id: item.store_id ? String(item.store_id) : undefined,
              operating_mode: item.operating_mode || 'PDV / Point',
              external_id: item.external_id || undefined,
            })
          }
        }
      }
    } catch (err) {
      console.warn('[mercadopago/devices] Error fetching /pos:', err)
    }

    // 2. Fetch from Mercado Pago Point Integration Devices API
    try {
      const pointRes = await fetch('https://api.mercadopago.com/point/integration-api/devices', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      if (pointRes.ok) {
        const pointData = await pointRes.json()
        const devices = pointData?.devices || (Array.isArray(pointData) ? pointData : [])
        for (const dev of devices) {
          const deviceId = String(dev.id || dev.pos_id)
          if (deviceId && !seenIds.has(deviceId)) {
            seenIds.add(deviceId)
            devicesList.push({
              id: deviceId,
              name: dev.name || `Point Device #${deviceId}`,
              pos_id: dev.pos_id ? String(dev.pos_id) : String(dev.id),
              operating_mode: dev.operating_mode || 'Point',
              model: dev.pos_type || dev.model || 'Point Smart / POS',
            })
          }
        }
      }
    } catch (err) {
      console.warn('[mercadopago/devices] Error fetching /point/integration-api/devices:', err)
    }

    return NextResponse.json({ devices: devicesList })
  } catch (error) {
    console.error('[mercadopago/devices GET]', error)
    return NextResponse.json({ error: 'Erro interno ao consultar o Mercado Pago' }, { status: 500 })
  }
}
