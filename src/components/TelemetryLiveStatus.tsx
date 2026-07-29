'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function TelemetryLiveStatus() {
  const router = useRouter()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const source = new EventSource('/api/telemetry/stream')
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => router.refresh(), 300)
    }

    return () => {
      clearTimeout(refreshTimer)
      source.close()
    }
  }, [router])

  return (
    <span className={`telemetry-badge ${connected ? 'live' : ''}`}>
      <span className="live-dot" /> {connected ? 'Ao vivo (SSE ativo)' : 'Reconectando telemetria'}
    </span>
  )
}
