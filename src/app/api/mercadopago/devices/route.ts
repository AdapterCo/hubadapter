import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decryptSecret } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

export interface MpPosDevice {
  id: string
  name: string
  pos_id?: string
  store_id?: string
  operating_mode?: string
  external_id?: string
  model?: string
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

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

    const token = decryptSecret(client.mpAccessToken)
    if (!token) {
      return NextResponse.json({ error: 'Token do Mercado Pago não configurado.' }, { status: 400 })
    }

    const devicesList: MpPosDevice[] = []
    const seenIds = new Set<string>()
    let tokenRejected = false

    // 1. Query Terminals API: https://api.mercadopago.com/terminals/v1/list
    try {
      const termRes = await fetch('https://api.mercadopago.com/terminals/v1/list', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })

      if (termRes.status === 401 || termRes.status === 403) {
        tokenRejected = true
      } else if (termRes.ok) {
        const termData = await termRes.json()
        const terminals =
          termData?.data?.terminals ||
          termData?.terminals ||
          (Array.isArray(termData) ? termData : [])

        for (const term of terminals) {
          const terminalId = String(term.id || term.pos_id || '')
          if (terminalId && !seenIds.has(terminalId)) {
            seenIds.add(terminalId)
            const displayName = String(term.id || '')
              .replace('__', ' • Serial: ')
              .replace('_', ' ')
            devicesList.push({
              id: terminalId,
              name: displayName || `Máquina ${terminalId}`,
              pos_id: term.pos_id ? String(term.pos_id) : undefined,
              store_id: term.store_id ? String(term.store_id) : undefined,
              operating_mode: term.operating_mode || 'STANDALONE',
            })
          }
        }
      }
    } catch (err) {
      console.warn('[mercadopago/devices] Error fetching /terminals/v1/list:', err)
    }

    // 2. Fallback to /pos API if terminals list returned empty
    if (devicesList.length === 0 && !tokenRejected) {
      try {
        const posRes = await fetch('https://api.mercadopago.com/pos', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
        })

        if (posRes.status === 401 || posRes.status === 403) {
          tokenRejected = true
        } else if (posRes.ok) {
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
                operating_mode: item.operating_mode || 'Point / POS',
              })
            }
          }
        }
      } catch (err) {
        console.warn('[mercadopago/devices] Error fetching /pos:', err)
      }
    }

    if (tokenRejected && devicesList.length === 0) {
      await prisma.client.update({
        where: { id: session.user.id },
        data: { mpTokenValid: false, mpTokenCheckedAt: new Date() },
      })
      return NextResponse.json(
        {
          error: 'O Access Token do Mercado Pago foi rejeitado ou expirou.',
          needsConfig: true,
        },
        { status: 401 }
      )
    }

    await prisma.client.update({
      where: { id: session.user.id },
      data: { mpTokenValid: true, mpTokenCheckedAt: new Date() },
    })

    return NextResponse.json({ devices: devicesList })
  } catch (error) {
    console.error('[mercadopago/devices GET]', error)
    return NextResponse.json({ error: 'Erro interno ao consultar o Mercado Pago' }, { status: 500 })
  }
}
