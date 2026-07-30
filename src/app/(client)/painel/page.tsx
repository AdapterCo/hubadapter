import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// Strict 90 seconds online cutoff (Device sends heartbeats every 30s)
const ONLINE_THRESHOLD_MS = 90 * 1000

async function getClientData(clientId: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const onlineCutoff = new Date(Date.now() - ONLINE_THRESHOLD_MS)

  const [machines, paymentsToday, revenueResult, onlineDevices, clientSettings] = await Promise.all([
    prisma.machine.findMany({
      where: { clientId },
      include: {
        esps: { select: { id: true, lastSeen: true, credits: true, serialNumber: true } },
      },
    }),
    prisma.payment.count({ where: { clientId, createdAt: { gte: today }, status: 'approved' } }),
    prisma.payment.aggregate({ where: { clientId, status: 'approved' }, _sum: { amount: true } }),
    prisma.esp32.count({
      where: {
        machine: { clientId },
        lastSeen: { gte: onlineCutoff },
      },
    }),
    prisma.client.findUnique({
      where: { id: clientId },
      select: {
        mpAccessToken: true,
        mpTokenValid: true,
        mpTokenCheckedAt: true,
      },
    }),
  ])

  return {
    machines,
    paymentsToday,
    totalRevenue: Number(revenueResult._sum.amount ?? 0),
    onlineDevices,
    mercadoPagoConfigured: Boolean(clientSettings?.mpAccessToken),
    mercadoPagoTokenInvalid: clientSettings?.mpTokenValid === false,
  }
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

      {!data.mercadoPagoConfigured && (
        <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
          <span>⚠️</span>
          <div>
            Configure o Access Token do Mercado Pago para consultar e validar pagamentos com segurança.{' '}
            <Link href="/configuracoes">Abrir configurações</Link>
          </div>
        </div>
      )}

      {data.mercadoPagoTokenInvalid && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <span>⚠️</span>
          <div>
            O Mercado Pago rejeitou o Access Token configurado. Atualize a credencial para
            que os pagamentos voltem a ser processados.{' '}
            <Link href="/configuracoes">Atualizar credencial</Link>
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">🖥️</div>
          <div><div className="stat-value">{data.machines.length}</div><div className="stat-label">Máquinas</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">📡</div>
          <div><div className="stat-value">{totalEsps}</div><div className="stat-label">Dispositivos</div></div>
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
          <Link href="/maquinas" className="btn btn-primary">Cadastrar primeira máquina</Link>
        </div>
      ) : (
        <div className="grid-2">
          {data.machines.map(m => {
            const onlineEsps = m.esps.filter(
              e => e.lastSeen && Date.now() - new Date(e.lastSeen).getTime() <= ONLINE_THRESHOLD_MS
            ).length
            const totalCredits = m.esps.reduce((acc, e) => acc + Number(e.credits), 0)
            return (
              <Link key={m.id} href={`/maquinas/${m.id}`} style={{ textDecoration: 'none' }}>
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
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dispositivos</div>
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
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
