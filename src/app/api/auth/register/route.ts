import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { name, email, password, idmaq } = await req.json()

    if (!name || !email || !password || !idmaq) {
      return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
    }

    const cleanIdmaq = idmaq.trim().toUpperCase()

    // Validate idmaq - must exist and not be claimed
    const device = await prisma.device.findUnique({ where: { idmaq: cleanIdmaq } })

    if (!device) {
      return NextResponse.json({ error: 'Código do dispositivo (IDMAQ) inválido. Verifique e tente novamente.' }, { status: 400 })
    }

    if (device.claimed) {
      return NextResponse.json({ error: 'Este dispositivo já foi vinculado a outra conta.' }, { status: 400 })
    }

    // Check if email already exists
    const existingUser = await prisma.client.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // Create client, claim device, and auto-create machine + ESP32 in transaction
    const client = await prisma.$transaction(async (tx) => {
      const newClient = await tx.client.create({
        data: { name, email, passwordHash, role: 'CLIENT' },
      })

      // Claim the device
      await tx.device.update({
        where: { idmaq: cleanIdmaq },
        data: { claimed: true, clientId: newClient.id },
      })

      // Auto-create a Machine for this device
      const machine = await tx.machine.create({
        data: {
          clientId: newClient.id,
          name: `Máquina ${cleanIdmaq}`,
          location: 'Principal',
        },
      })

      // Auto-create the ESP32 representing this idmaq, using cleanIdmaq as topic
      const esp32 = await tx.esp32.create({
        data: {
          machineId: machine.id,
          serialNumber: cleanIdmaq,
          mqttTopic: cleanIdmaq,
          online: false,
          credits: 0,
        },
      })

      return newClient
    })

    return NextResponse.json({ success: true, clientId: client.id })
  } catch (err) {
    console.error('[register POST]', err)
    return NextResponse.json({ error: 'Erro interno ao criar conta. Tente novamente.' }, { status: 500 })
  }
}
