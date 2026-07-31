import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

// GET /api/admin/subscriptions - Listar mensalidades dos clientes e dispositivos
export async function GET() {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado. Requer administrador.' }, { status: 403 })
  }

  try {
    const devices = await prisma.esp32.findMany({
      select: {
        id: true,
        serialNumber: true,
        subscriptionStatus: true,
        paidUntil: true,
        monthlyFee: true,
        online: true,
        lastSeen: true,
        machine: {
          select: {
            id: true,
            name: true,
            client: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        subscriptionPayments: {
          orderBy: { paidAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()

    // Formatar e calcular receita mensal da plataforma (SaaS R$ 29,99/mês por IDMAQ)
    const formatted = devices.map(d => {
      const isOverdue = d.paidUntil ? new Date(d.paidUntil) < now : false
      const computedStatus = d.subscriptionStatus === 'BLOCKED'
        ? 'BLOCKED'
        : isOverdue
        ? 'OVERDUE'
        : 'ACTIVE'

      return {
        id: d.id,
        serialNumber: d.serialNumber,
        status: computedStatus,
        rawStatus: d.subscriptionStatus,
        paidUntil: d.paidUntil,
        monthlyFee: Number(d.monthlyFee),
        client: d.machine.client,
        machineName: d.machine.name,
        online: d.online,
        lastSeen: d.lastSeen,
        history: d.subscriptionPayments.map(sp => ({
          id: sp.id,
          amount: Number(sp.amount),
          months: sp.months,
          paidAt: sp.paidAt,
          periodEnd: sp.periodEnd,
        })),
      }
    })

    const activeDevices = formatted.filter(d => d.status === 'ACTIVE').length
    const overdueDevices = formatted.filter(d => d.status === 'OVERDUE').length
    const blockedDevices = formatted.filter(d => d.status === 'BLOCKED').length
    const totalMonthlySaasRevenue = formatted.reduce((acc, d) => acc + (d.status === 'ACTIVE' ? d.monthlyFee : 0), 0)

    return NextResponse.json({
      devices: formatted,
      summary: {
        totalDevices: formatted.length,
        activeDevices,
        overdueDevices,
        blockedDevices,
        totalMonthlySaasRevenue,
      },
    })
  } catch (error) {
    console.error('[admin/subscriptions GET]', error)
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 })
  }
}

// POST /api/admin/subscriptions - Dar baixa em mensalidade (Renovar) ou Bloquear/Desbloquear
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { esp32Id, action, months = 1, notes } = body

    if (!esp32Id || !action) {
      return NextResponse.json({ error: 'esp32Id e action são obrigatórios.' }, { status: 400 })
    }

    const esp32 = await prisma.esp32.findUnique({
      where: { id: esp32Id },
      include: { machine: { select: { clientId: true } } },
    })

    if (!esp32) {
      return NextResponse.json({ error: 'Dispositivo não encontrado.' }, { status: 404 })
    }

    const now = new Date()

    if (action === 'renew') {
      // Calcular nova data limite (adicionar X meses / 30 dias)
      const currentPaidUntil = esp32.paidUntil && new Date(esp32.paidUntil) > now
        ? new Date(esp32.paidUntil)
        : new Date()
      
      const newPaidUntil = new Date(currentPaidUntil.getTime() + months * 30 * 24 * 60 * 60 * 1000)
      const feeAmount = new Prisma.Decimal(Number(esp32.monthlyFee) * months)

      await prisma.$transaction([
        prisma.esp32.update({
          where: { id: esp32Id },
          data: {
            subscriptionStatus: 'ACTIVE',
            paidUntil: newPaidUntil,
          },
        }),
        prisma.subscriptionPayment.create({
          data: {
            clientId: esp32.machine.clientId,
            esp32Id: esp32.id,
            amount: feeAmount,
            months,
            paidAt: now,
            periodEnd: newPaidUntil,
            notes: notes || `Baixa de mensalidade (${months} mês/meses de R$ 29,99)`,
          },
        }),
      ])

      return NextResponse.json({
        success: true,
        message: `Mensalidade renovada por +${months} mês(es) com sucesso! Válido até ${newPaidUntil.toLocaleDateString('pt-BR')}.`,
        paidUntil: newPaidUntil,
      })
    }

    if (action === 'block') {
      await prisma.esp32.update({
        where: { id: esp32Id },
        data: { subscriptionStatus: 'BLOCKED' },
      })
      return NextResponse.json({ success: true, message: 'Dispositivo BLOQUEADO com sucesso!' })
    }

    if (action === 'unblock') {
      await prisma.esp32.update({
        where: { id: esp32Id },
        data: { subscriptionStatus: 'ACTIVE' },
      })
      return NextResponse.json({ success: true, message: 'Dispositivo DESBLOQUEADO com sucesso!' })
    }

    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 })
  } catch (error) {
    console.error('[admin/subscriptions POST]', error)
    return NextResponse.json({ error: 'Erro interno ao atualizar mensalidade.' }, { status: 500 })
  }
}
