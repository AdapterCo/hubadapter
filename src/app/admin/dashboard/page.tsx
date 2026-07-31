import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const ONLINE_THRESHOLD_MS = 90 * 1000

async function getAdminDashboardStats() {
  const onlineCutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS)
  const now = new Date()
  const in5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)

  const [
    totalClients,
    totalDevices,
    onlineDevices,
    devicesWithSubscriptions,
  ] = await Promise.all([
    prisma.client.count({ where: { role: 'CLIENT' } }),
    prisma.esp32.count(),
    prisma.esp32.count({
      where: { lastSeen: { gte: onlineCutoff } },
    }),
    prisma.esp32.findMany({
      orderBy: [
        { subscriptionStatus: 'desc' },
        { paidUntil: 'asc' },
      ],
      include: {
        machine: {
          select: {
            name: true,
            client: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    }),
  ])

  const formattedDevices = devicesWithSubscriptions.map(d => {
    const paidUntilDate = d.paidUntil ? new Date(d.paidUntil) : null
    let computedStatus: 'ACTIVE' | 'SOON' | 'OVERDUE' | 'BLOCKED' = 'ACTIVE'

    if (d.subscriptionStatus === 'BLOCKED') {
      computedStatus = 'BLOCKED'
    } else if (!paidUntilDate || paidUntilDate < now) {
      computedStatus = 'OVERDUE'
    } else if (paidUntilDate <= in5Days) {
      computedStatus = 'SOON'
    }

    return {
      id: d.id,
      serialNumber: d.serialNumber,
      clientName: d.machine.client.name,
      clientEmail: d.machine.client.email,
      machineName: d.machine.name,
      monthlyFee: Number(d.monthlyFee),
      paidUntil: paidUntilDate,
      status: computedStatus,
    }
  })

  const activeCount = formattedDevices.filter(d => d.status === 'ACTIVE' || d.status === 'SOON').length
  const overdueCount = formattedDevices.filter(d => d.status === 'OVERDUE').length
  const blockedCount = formattedDevices.filter(d => d.status === 'BLOCKED').length
  const soonExpiringCount = formattedDevices.filter(d => d.status === 'SOON').length

  const totalMonthlyRevenue = formattedDevices
    .filter(d => d.status === 'ACTIVE' || d.status === 'SOON')
    .reduce((sum, d) => sum + d.monthlyFee, 0)

  return {
    totalClients,
    totalDevices,
    onlineDevices,
    activeCount,
    overdueCount,
    blockedCount,
    soonExpiringCount,
    totalMonthlyRevenue,
    devices: formattedDevices,
  }
}

function fmt(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDaysRemaining(paidUntil: Date | null) {
  if (!paidUntil) return { text: 'Sem registro de pagamento', isUrgent: true }
  const diffMs = paidUntil.getTime() - Date.now()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (days < 0) return { text: `Vencido há ${Math.abs(days)} dia(s)`, isUrgent: true }
  if (days === 0) return { text: 'Vence HOJE!', isUrgent: true }
  if (days <= 5) return { text: `Vence em ${days} dia(s)`, isUrgent: true }
  return { text: `Válido por +${days} dia(s)`, isUrgent: false }
}

export default async function AdminDashboard() {
  const stats = await getAdminDashboardStats()

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Dashboard Geral do Administrador</h1>
          <p>Visão geral da plataforma e controle de vencimento dos IDMAQs (R$ 29,99/mês)</p>
        </div>
        <span className="telemetry-badge live"><span className="live-dot" /> Ao vivo</span>
      </div>

      {/* CARDS DE MÉTRICAS */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon purple">👥</div>
          <div><div className="stat-value">{stats.totalClients}</div><div className="stat-label">Clientes</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📡</div>
          <div><div className="stat-value">{stats.totalDevices}</div><div className="stat-label">Dispositivos cadastrados</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">🟢</div>
          <div><div className="stat-value">{stats.onlineDevices}</div><div className="stat-label">Dispositivos online agora</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">⚠️</div>
          <div><div className="stat-value">{stats.overdueCount + stats.soonExpiringCount}</div><div className="stat-label">Vencidos / Vencendo logo</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div><div className="stat-value">{fmt(stats.totalMonthlyRevenue)}</div><div className="stat-label">Receita Mensal Estimada</div></div>
        </div>
      </div>

      {/* TABELA DE CONTROLE DE VENCIMENTO DE IDMAQS */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="section-title">📅 Período de Vencimento dos IDMAQs</div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Acompanhe a data de vencimento da mensalidade de cada dispositivo para cobrança prévia
            </p>
          </div>
          <Link href="/admin/pagamentos" className="btn btn-primary btn-sm">
            ⚙️ Gerenciar & Dar Baixa nas Mensalidades
          </Link>
        </div>

        {stats.devices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <p>Nenhum dispositivo vinculado a clientes ainda.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Máquina</th>
                  <th>IDMAQ Dispositivo</th>
                  <th>Mensalidade</th>
                  <th>Status Assinatura</th>
                  <th>Data de Vencimento</th>
                  <th>Prazo de Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {stats.devices.map(d => {
                  const daysInfo = formatDaysRemaining(d.paidUntil)
                  return (
                    <tr key={d.id}>
                      <td className="strong">
                        {d.clientName}
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.clientEmail}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>🖥️ {d.machineName}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{d.serialNumber}</td>
                      <td className="strong" style={{ color: 'var(--accent-light)' }}>
                        {fmt(d.monthlyFee)}/mês
                      </td>
                      <td>
                        {d.status === 'ACTIVE' ? (
                          <span className="badge online">🟢 Ativo</span>
                        ) : d.status === 'SOON' ? (
                          <span className="badge warning">🟡 Vencendo em Breve</span>
                        ) : d.status === 'OVERDUE' ? (
                          <span className="badge offline">🔴 Vencido / Inadimplente</span>
                        ) : (
                          <span className="badge offline">🚫 Bloqueado</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {d.paidUntil ? d.paidUntil.toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: '12px',
                            color: daysInfo.isUrgent ? 'var(--danger)' : 'var(--success)',
                          }}
                        >
                          {daysInfo.text}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
