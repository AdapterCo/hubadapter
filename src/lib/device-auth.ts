import { prisma } from './prisma'
import { hashSecret, secretsEqual } from './crypto'

export async function authenticateDevice(req: Request, serialNumber: string) {
  const authorization = req.headers.get('authorization')
  const apiKey = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!apiKey) return null

  const esp32 = await prisma.esp32.findUnique({ where: { serialNumber } })
  if (!esp32?.apiKeyHash) return null

  return secretsEqual(hashSecret(apiKey), esp32.apiKeyHash) ? esp32 : null
}
