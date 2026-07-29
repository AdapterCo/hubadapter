import { PrismaClient } from '@prisma/client'
import { encryptSecret } from '../src/lib/crypto'

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
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
