import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'

function fmt(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function AdminClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      devices: true,
      machines: {
        include: {
          esps: true,
        },
      },
      payments: {
        take: 20,
        orderBy: { createdAt: 'desc' },
        include: { esp32: { select: { serialNumber: true } } },
      },
    },
  })

  if (!client) notFound()

  const totalPayments = client.payments.reduce(
    (acc, p) => acc + (p.status === 'approved' ? Number(p.amount) : 0),
    0
  )
  const onlineCutoff = Date.now() - 10 * 60 * 1000

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Detalhes do Cliente</h1>
          <p>{client.name} — {client.email}</p>
        </div>
        <Link href="/admin/clientes" className="btn btn-secondary">⬅️ Voltar</Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon purple">👤</div>
          <div>
            <div className="stat-value">{client.active ? 'Ativo' : 'Inativo'}</div>
            <div className="stat-label">Status da Conta</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">🖥️</div>
          <div>
            <div className="stat-value">{client.machines.length}</div>
            <div className="stat-label">Máquinas</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">💰</div>
          <div>
            <div className="stat-value">{fmt(totalPayments)}</div>
            <div className="stat-label">Total Aprovado</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="section-title">🔑 Informações e Webhook</div>
        <div className="form-group">
          <label className="form-label">URL do Webhook Mercado Pago</label>
          <div className="copy-box">
            <input type="text" readOnly value={`https://hub.adapterco.com.br/api/webhook/${client.webhookToken}`} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Access Token Mercado Pago</label>
          <input
            type="text"
            readOnly
            className="form-input"
            value={client.mpAccessToken ? 'Configurado' : 'Não configurado pelo cliente'}
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <div className="section-title">🖥️ Máquinas e ESP32s</div>
      <div className="card" style={{ marginBottom: '24px' }}>
        {client.machines.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🖥️</div>
            <p>Nenhuma máquina cadastrada para este cliente.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Máquina</th>
                  <th>IDMAQ (Serial)</th>
                  <th>Tópico MQTT</th>
                  <th>Maquininha MP Vinculada</th>
                  <th>Créditos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {client.machines.flatMap(m =>
                  m.esps.map(e => (
                    <tr key={e.id}>
                      <td className="strong">{m.name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{e.serialNumber}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-light)' }}>{e.mqttTopic}</td>
                      <td>{e.mpPosName ? `💳 ${e.mpPosName}` : <span style={{ color: 'var(--text-muted)' }}>Não vinculada</span>}</td>
                      <td className="strong">{Number(e.credits).toFixed(2)}</td>
                      <td>
                        {e.lastSeen && new Date(e.lastSeen).getTime() >= onlineCutoff
                          ? <span className="badge online">Online</span>
                          : <span className="badge offline">Offline</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-title">💳 Histórico de Pagamentos</div>
      <div className="card">
        {client.payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento efetuado por este cliente.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>IDMAQ</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>MP Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {client.payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(p.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{p.esp32.serialNumber}</td>
                    <td className="strong">{fmt(Number(p.amount))}</td>
                    <td>
                      <span className={`badge ${p.status}`}>
                        {p.status === 'approved' ? 'Aprovado' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>#{p.mpPaymentId}</td>
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
