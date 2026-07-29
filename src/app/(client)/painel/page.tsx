import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

async function getClientData(clientId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [machines, paymentsToday, revenueResult, onlineDevices] = await Promise.all([
    prisma.machine.findMany({
      where: { clientId },
      include: {
        esps: { select: { id: true, online: true, credits: true, serialNumber: true } },
      },
    }),
    prisma.payment.count({ where: { clientId, createdAt: { gte: today }, status: 'approved' } }),
    prisma.payment.aggregate({ where: { clientId, status: 'approved' }, _sum: { amount: true } }),
    prisma.esp32.count({ where: { machine: { clientId }, online: true } }),
  ])

  return { machines, paymentsToday, totalRevenue: revenueResult._sum.amount ?? 0, onlineDevices }
}

function fmt(val: number) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default async function PainelPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const data = await getClientData(session.user.id)
  const totalEsps = data.machines.reduce((acc, m) => acc + m.esps.length, 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Meu Painel</h1>
          <p>Olá, {session.user.name} 👋</p>
        </div>
        <span className="telemetry-badge live"><span className="live-dot" /> Ao vivo</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">🖥️</div>
          <div><div className="stat-value">{data.machines.length}</div><div className="stat-label">Máquinas</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📡</div>
          <div><div className="stat-value">{totalEsps}</div><div className="stat-label">ESP32s</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">🟢</div>
          <div><div className="stat-value">{data.onlineDevices}</div><div className="stat-label">Online agora</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">💳</div>
          <div><div className="stat-value">{data.paymentsToday}</div><div className="stat-label">Pagamentos hoje</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div><div className="stat-value">{fmt(data.totalRevenue)}</div><div className="stat-label">Receita total</div></div>
        </div>
      </div>

      <div className="section-title">🖥️ Minhas Máquinas</div>

      {data.machines.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🖥️</div>
          <p>Você ainda não tem máquinas cadastradas.</p>
          <a href="/maquinas" className="btn btn-primary">Cadastrar primeira máquina</a>
        </div>
      ) : (
        <div className="grid-2">
          {data.machines.map(m => {
            const onlineEsps = m.esps.filter(e => e.online).length
            const totalCredits = m.esps.reduce((acc, e) => acc + e.credits, 0)
            return (
              <a key={m.id} href={`/maquinas/${m.id}`} style={{ textDecoration: 'none' }}>
                <div className="card" style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>{m.name}</div>
                      {m.location && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>📍 {m.location}</div>}
                    </div>
                    <div className="stat-icon blue" style={{ width: '36px', height: '36px', fontSize: '16px' }}>🖥️</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ESP32s</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{m.esps.length}</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Online</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: onlineEsps > 0 ? 'var(--success)' : 'var(--danger)' }}>{onlineEsps}</div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Créditos</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-light)' }}>{totalCredits.toFixed(0)}</div>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
