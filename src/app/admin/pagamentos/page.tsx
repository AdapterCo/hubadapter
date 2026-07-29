import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

function fmt(val: number) {
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default async function AdminPagamentosPage() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/login')

  const payments = await prisma.payment.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { name: true, email: true } },
      esp32: { select: { serialNumber: true, mpPosName: true } },
    },
  })

  const totalAmount = payments
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Todos os Pagamentos</h1>
          <p>Histórico global de transações Mercado Pago ({fmt(totalAmount)} aprovados)</p>
        </div>
      </div>

      <div className="card">
        {payments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento registrado no sistema ainda.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>IDMAQ (ESP32)</th>
                  <th>Maquininha MP</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>MP Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                      {new Date(p.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="strong">{p.client.name} ({p.client.email})</td>
                    <td style={{ fontFamily: 'monospace' }}>{p.esp32.serialNumber}</td>
                    <td style={{ fontSize: '12px' }}>{p.esp32.mpPosName || '—'}</td>
                    <td className="strong">{fmt(Number(p.amount))}</td>
                    <td>
                      <span className={`badge ${p.status}`}>
                        {p.status === 'approved' ? '✅ Aprovado' : p.status === 'pending' ? '⏳ Pendente' : '❌ Rejeitado'}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                      #{p.mpPaymentId}
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
