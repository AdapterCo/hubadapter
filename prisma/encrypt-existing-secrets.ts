import { PrismaClient } from '@prisma/client'
import { encryptSecret, generateDeviceSecret, hashSecret } from '../src/lib/crypto'

const prisma = new PrismaClient()

async function main() {
  const clients = await prisma.client.findMany({
    where: { mpAccessToken: { not: null } },
    select: { id: true, mpAccessToken: true },
  })

  for (const client of clients) {
    if (client.mpAccessToken && !client.mpAccessToken.startsWith('enc:v1:')) {
      await prisma.client.update({
        where: { id: client.id },
        data: { mpAccessToken: encryptSecret(client.mpAccessToken) },
      })
    }
  }

  const devices = await prisma.device.findMany()

  for (const device of devices) {
    let apiKey: string | null = null
    let apiKeyHash = device.apiKeyHash
    let commandSecret = device.commandSecret
    if (!apiKeyHash || !commandSecret) {
      apiKey = generateDeviceSecret()
      apiKeyHash = hashSecret(apiKey)
      commandSecret = encryptSecret(apiKey)
    }

    await prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: device.id },
        data: { apiKeyHash, commandSecret },
      })
      await tx.esp32.updateMany({
        where: { serialNumber: device.idmaq },
        data: { apiKeyHash, commandSecret },
      })
    })

    if (apiKey) {
      console.log(
        `Existing device ${device.idmaq} received a new key. Store it securely and reflash the device: ${apiKey}`
      )
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
