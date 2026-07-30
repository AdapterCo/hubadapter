'use client'

interface Esp32Props {
  serialNumber: string
  lastSeen: string | Date | null
  online: boolean
  mqttTopic: string
  credits: number
}

export default function Esp32ActivityReport({
  serialNumber,
  lastSeen,
  online,
  mqttTopic,
  credits,
}: Esp32Props) {
  const lastSeenDate = lastSeen ? new Date(lastSeen) : null
  const now = new Date()
  const diffSeconds = lastSeenDate
    ? Math.floor((now.getTime() - lastSeenDate.getTime()) / 1000)
    : null

  function formatTimeAgo(sec: number | null) {
    if (sec === null) return 'Nunca conectado'
    if (sec < 60) return `${sec} segundo(s) atrás`
    const mins = Math.floor(sec / 60)
    if (mins < 60) return `${mins} minuto(s) atrás`
    const hrs = Math.floor(mins / 60)
    return `${hrs} hora(s) atrás`
  }

  const isStrictOnline = diffSeconds !== null && diffSeconds <= 90

  return (
    <div
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        marginTop: '20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--text-primary)' }}>
          📊 Relatório de Atividade & Uptime do ESP32 ({serialNumber})
        </div>
        <div>
          {isStrictOnline ? (
            <span className="badge online"><span className="pulse" /> ONLINE</span>
          ) : (
            <span className="badge offline">OFFLINE</span>
          )}
        </div>
      </div>

      <div className="grid-3" style={{ gap: '12px' }}>
        <div
          style={{
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '12px 14px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status de Comunicação</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: isStrictOnline ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            {isStrictOnline ? '🟢 Ativo & Respondendo' : '🔴 Inativo / Desconectado'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {formatTimeAgo(diffSeconds)}
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '12px 14px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Frequência de Heartbeat</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-light)', marginTop: '4px' }}>
            A cada 30 segundos
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            HTTPS / MQTT (Porta 1883)
          </div>
        </div>

        <div
          style={{
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '12px 14px',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Proteção de Estorno Ativa</div>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
            ⚡ Ponta a Ponta (ACK)
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Estorna se sem resposta em 4.5s
          </div>
        </div>
      </div>
    </div>
  )
}
