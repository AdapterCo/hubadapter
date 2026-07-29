import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/Providers'

export const metadata: Metadata = {
  title: 'AdapterHub — Sistema de Telemetria',
  description: 'Plataforma de gestão de dispositivos ESP32, telemetria e pagamentos via MercadoPago.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
