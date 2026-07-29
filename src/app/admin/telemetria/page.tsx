import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import TelemetryLiveStatus from '@/components/TelemetryLiveStatus'

export default async function AdminTelemetriaPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const [esps, events, webhookIssues] = await Promise.all([
    prisma.esp32.findMany({
      include: {
        machine: { include: { client: { select: { name: true } } } },
      },
      orderBy: { lastSeen: 'desc' },
    }),
    prisma.telemetryEvent.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        esp32: {
          select: { serialNumber: true, machine: { select: { name: true, client: { select: { name: true } } } } },
        },
      },
    }),
    prisma.webhookIssue.findMany({
      where: { resolved: false },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { client: { select: { name: true } } },
    }),
  ])

  const onlineCutoff = Date.now() - 10 * 60 * 1000
  const isOnline = (lastSeen: Date | null) =>
    Boolean(lastSeen && new Date(lastSeen).getTime() >= onlineCutoff)
  const onlineCount = esps.filter(e => isOnline(e.lastSeen)).length

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Telemetria Global</h1>
          <p>Monitoramento em tempo real dos dispositivos ESP32 ({onlineCount}/{esps.length} online)</p>
        </div>
        <TelemetryLiveStatus />
      </div>

      {webhookIssues.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '24px' }}>
          <div>
            <strong>Pagamentos aguardando associação</strong>
            {webhookIssues.map(issue => (
              <div key={issue.id} style={{ marginTop: '6px' }}>
                Cliente {issue.client.name}, pagamento #{issue.paymentId}
                {issue.posId ? `, POS ${issue.posId}` : ''}.
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section-title">📡 Status dos ESP32s</div>
      <div className="card" style={{ marginBottom: '28px' }}>
        {esps.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <p>Nenhum ESP32 cadastrado no sistema.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>IDMAQ (Serial)</th>
                  <th>Cliente</th>
                  <th>Máquina</th>
                  <th>Status</th>
                  <th>Tópico MQTT</th>
                  <th>Créditos Liberados</th>
                  <th>Última Conexão</th>
                </tr>
              </thead>
              <tbody>
                {esps.map(e => (
                  <tr key={e.id}>
                    <td className="strong" style={{ fontFamily: 'monospace' }}>{e.serialNumber}</td>
                    <td>{e.machine.client.name}</td>
                    <td>{e.machine.name}</td>
                    <td>
                      {isOnline(e.lastSeen) ? (
                        <span className="badge online"><span className="pulse" /> Online</span>
                      ) : (
                        <span className="badge offline">Offline</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-light)' }}>
                      {e.mqttTopic}
                    </td>
                    <td className="strong">{Number(e.credits).toFixed(2)}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {e.lastSeen ? new Date(e.lastSeen).toLocaleString('pt-BR') : 'Nunca'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="section-title">📜 Log de Eventos da Telemetria</div>
      <div className="card">
        {events.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📜</div>
            <p>Nenhum evento de telemetria registrado recentemente.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>IDMAQ</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      {new Date(ev.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{ev.esp32.serialNumber}</td>
                    <td>{ev.esp32.machine.client.name}</td>
                    <td><span className="badge info">{ev.type}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-light)' }}>
                      {ev.payload}
                    </td>
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
