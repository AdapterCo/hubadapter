import { prisma } from './prisma'

const MAX_ATTEMPTS = 12

export async function processOutboxBatch(limit = 20): Promise<{ sent: number; failed: number }> {
  const messages = await prisma.outboxMessage.findMany({
    where: {
      status: { in: ['PENDING', 'RETRY'] },
      nextAttempt: { lte: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let sent = 0
  let failed = 0

  for (const message of messages) {
    try {
      const mqttApiToken = process.env.MQTT_API_TOKEN
      if (!mqttApiToken) throw new Error('MQTT_API_TOKEN is not configured')

      const response = await fetch(
        process.env.MQTT_API_URL || 'https://apimqtt.adapterco.com.br/publish',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mqttApiToken}`,
          },
          body: JSON.stringify({ topic: message.topic, message: message.payload }),
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!response.ok) throw new Error(`MQTT API returned ${response.status}`)

      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          sentAt: new Date(),
          lastError: null,
        },
      })
      sent += 1
    } catch (error) {
      const attempts = message.attempts + 1
      const delaySeconds = Math.min(3600, 5 * 2 ** Math.min(attempts - 1, 9))
      await prisma.outboxMessage.update({
        where: { id: message.id },
        data: {
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY',
          attempts,
          nextAttempt: new Date(Date.now() + delaySeconds * 1000),
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error',
        },
      })
      failed += 1
    }
  }

  return { sent, failed }
}
