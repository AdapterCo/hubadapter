import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/esp32 - Vincular/cadastrar um novo dispositivo a uma máquina
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const body = await req.json();
    const { machineId, serialNumber } = body;

    if (!machineId || !serialNumber) {
      return NextResponse.json(
        { error: "O código da máquina e o IDMAQ do dispositivo são obrigatórios." },
        { status: 400 }
      );
    }

    const cleanSerial = serialNumber.trim().toUpperCase();

    // 1. Validar se a máquina pertence ao cliente da sessão
    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        clientId: session.user.id,
      },
    });

    if (!machine) {
      return NextResponse.json(
        { error: "Máquina não encontrada ou você não tem permissão." },
        { status: 404 }
      );
    }

    // 2. Verificar se este IDMAQ já está cadastrado em alguma máquina
    const existingEsp = await prisma.esp32.findUnique({
      where: { serialNumber: cleanSerial },
      include: { machine: { select: { clientId: true } } },
    });

    if (existingEsp) {
      if (existingEsp.machine.clientId !== session.user.id) {
        return NextResponse.json(
          { error: "Este código de dispositivo (IDMAQ) já pertence a outro cliente." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Este dispositivo (IDMAQ) já está cadastrado em uma de suas máquinas." },
        { status: 409 }
      );
    }

    // 3. Verificar se existe registro em Device e se pertence a outro cliente
    const masterDevice = await prisma.device.findUnique({
      where: { idmaq: cleanSerial },
    });

    if (masterDevice && masterDevice.claimed && masterDevice.clientId && masterDevice.clientId !== session.user.id) {
      return NextResponse.json(
        { error: "Este dispositivo (IDMAQ) já foi reivindicado por outro cliente." },
        { status: 409 }
      );
    }

    // 4. Auto-reivindicar / provisionar o Device na tabela master
    await prisma.device.upsert({
      where: { idmaq: cleanSerial },
      create: {
        idmaq: cleanSerial,
        claimed: true,
        clientId: session.user.id,
      },
      update: {
        claimed: true,
        clientId: session.user.id,
      },
    });

    // 5. Criar o dispositivo associado à máquina
    const esp32 = await prisma.esp32.create({
      data: {
        machineId,
        serialNumber: cleanSerial,
        mqttTopic: cleanSerial,
        online: false,
        credits: 0,
      },
    });

    return NextResponse.json(
      { ...esp32, credits: Number(esp32.credits) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[esp32 POST]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor ao cadastrar dispositivo." },
      { status: 500 }
    );
  }
}
