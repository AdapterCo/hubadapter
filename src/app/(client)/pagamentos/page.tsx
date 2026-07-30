'use client'

import { useState, useEffect, useCallback } from 'react'

interface Payment {
  id: string
  mpPaymentId: string
  amount: number
  status: string
  paymentMethod: string | null
  createdAt: string
  esp32: { serialNumber: string }
}

function fmt(val: number) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function PagamentosPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'approved' | 'rejected'>('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/payments?limit=100')
    const data = await res.json()
    setPayments(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter(p => {
    if (filter === 'all') return true
    if (filter === 'approved') return p.status === 'approved'
    if (filter === 'rejected') return p.status === 'rejected' || p.status === 'refunded'
    return true
  })

  const countAll = payments.length
  const countApproved = payments.filter(p => p.status === 'approved').length
  const countRejected = payments.filter(p => p.status === 'rejected' || p.status === 'refunded').length
  const totalApproved = payments.filter(p => p.status === 'approved').reduce((a, p) => a + p.amount, 0)

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Pagamentos</h1>
          <p>{fmt(totalApproved)} em pagamentos aprovados</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>🔄 Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('all')}
        >
          Todos ({countAll})
        </button>
        <button
          className={`btn ${filter === 'approved' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('approved')}
        >
          ✅ Aprovados ({countApproved})
        </button>
        <button
          className={`btn ${filter === 'rejected' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setFilter('rejected')}
        >
          ❌ Rejeitados / Estornados ({countRejected})
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento encontrado para o filtro selecionado.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Valor</th>
                  <th>Método</th>
                  <th>Status</th>
                  <th>Dispositivo</th>
                  <th>MP ID</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {new Date(p.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="strong">{fmt(p.amount)}</td>
                    <td>
                      <span className="badge info" style={{ fontSize: '11px' }}>
                        {p.paymentMethod || 'Pix / Cartão'}
                      </span>
                    </td>
                    <td>
                      {p.status === 'approved' ? (
                        <span className="badge online">✅ Aprovado</span>
                      ) : p.status === 'refunded' ? (
                        <span className="badge warning">💸 Estornado</span>
                      ) : (
                        <span className="badge offline">❌ Rejeitado</span>
                      )}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.esp32.serialNumber}</td>
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
