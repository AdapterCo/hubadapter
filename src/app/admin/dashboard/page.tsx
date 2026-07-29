import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ONLINE_THRESHOLD_MS = 90 * 1000

async function getStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const onlineCutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS)

  const [totalClients, totalDevices, onlineDevices, paymentsToday, revenueResult, recentPayments] = await Promise.all([
    prisma.client.count({ where: { role: 'CLIENT' } }),
    prisma.esp32.count(),
    prisma.esp32.count({
      where: { lastSeen: { gte: onlineCutoff } },
    }),
    prisma.payment.count({ where: { createdAt: { gte: today }, status: 'approved' } }),
    prisma.payment.aggregate({ where: { createdAt: { gte: today }, status: 'approved' }, _sum: { amount: true } }),
    prisma.payment.findMany({ take: 10, orderBy: { createdAt: 'desc' }, include: { client: { select: { name: true } }, esp32: { select: { serialNumber: true } } } }),
  ])
  return {
    totalClients,
    totalDevices,
    onlineDevices,
    paymentsToday,
    revenueToday: Number(revenueResult._sum.amount ?? 0),
    recentPayments,
  }
}

function fmt(val: number) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function timeAgo(date: Date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atrás`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h atrás`
  return `${Math.floor(hrs / 24)}d atrás`
}

export default async function AdminDashboard() {
  const stats = await getStats()
  return (
    <div className="page-content">
      <div className="page-header">
        <div><h1>Dashboard Global</h1><p>Visão geral do sistema AdapterHub</p></div>
        <span className="telemetry-badge live"><span className="live-dot" /> Ao vivo</span>
      </div>
      <div className="stats-grid">
        {[
          { icon: '👥', value: stats.totalClients, label: 'Clientes', color: 'purple' },
          { icon: '📡', value: stats.totalDevices, label: 'ESP32s cadastrados', color: 'blue' },
          { icon: '🟢', value: stats.onlineDevices, label: 'ESP32s online', color: 'green' },
          { icon: '💳', value: stats.paymentsToday, label: 'Pagamentos hoje', color: 'yellow' },
          { icon: '💰', value: fmt(stats.revenueToday), label: 'Receita hoje', color: 'green' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className={`stat-icon ${s.color}`}>{s.icon}</div>
            <div><div className="stat-value">{s.value}</div><div className="stat-label">{s.label}</div></div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="section-title">💳 Últimos pagamentos</div>
        {stats.recentPayments.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">💳</div><p>Nenhum pagamento registrado ainda.</p></div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Cliente</th><th>ESP32</th><th>Valor</th><th>Status</th><th>Quando</th></tr></thead>
              <tbody>
                {stats.recentPayments.map(p => (
                  <tr key={p.id}>
                    <td className="strong">{p.client.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.esp32.serialNumber}</td>
                    <td className="strong">{fmt(Number(p.amount))}</td>
                    <td><span className={`badge ${p.status}`}>{p.status === 'approved' ? 'Aprovado' : p.status === 'pending' ? 'Pendente' : 'Rejeitado'}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>{timeAgo(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
