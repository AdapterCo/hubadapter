'use client'

import { useState, useEffect, useCallback } from 'react'

interface Payment {
  id: string
  mpPaymentId: string
  amount: number
  status: string
  createdAt: string
  esp32: { serialNumber: string }
}

function fmt(val: number) { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function PagamentosPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/payments?limit=100')
    const data = await res.json()
    setPayments(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = payments.filter(p => filter === 'all' ? true : p.status === filter)
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
        {(['all', 'approved', 'pending', 'rejected'] as const).map(f => {
          const count = f === 'all' ? payments.length : payments.filter(p => p.status === f).length
          return (
            <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setFilter(f)}>
              {f === 'all' ? `Todos (${count})` : f === 'approved' ? `✅ Aprovados (${count})` : f === 'pending' ? `⏳ Pendentes (${count})` : `❌ Rejeitados (${count})`}
            </button>
          )
        })}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}><span className="loading-spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">💳</div>
            <p>Nenhum pagamento encontrado.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Data</th><th>Valor</th><th>Status</th><th>ESP32</th><th>MP ID</th></tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>{new Date(p.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="strong">{fmt(p.amount)}</td>
                    <td>
                      <span className={`badge ${p.status}`}>
                        {p.status === 'approved' ? '✅ Aprovado' : p.status === 'pending' ? '⏳ Pendente' : '❌ Rejeitado'}
                      </span>
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
