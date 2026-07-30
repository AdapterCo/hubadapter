import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/esp32/[id] - Obter detalhes do dispositivo
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id,
        machine: { clientId: session.user.id },
      },
      select: {
        id: true,
        serialNumber: true,
        mqttTopic: true,
        online: true,
        lastSeen: true,
        credits: true,
        mpPosId: true,
        mpPosName: true,
        createdAt: true,
        payments: {
          orderBy: { id: "desc" },
          take: 20,
          select: {
            id: true,
            mpPaymentId: true,
            amount: true,
            status: true,
            externalRef: true,
            createdAt: true,
          },
        },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      ...esp32,
      credits: Number(esp32.credits),
      payments: esp32.payments.map((payment) => ({
        ...payment,
        amount: Number(payment.amount),
      })),
    });
  } catch (error) {
    console.error("[esp32/[id] GET]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// PATCH /api/esp32/[id] - Atualizar status do dispositivo
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id,
        machine: { clientId: session.user.id },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    const body = await req.json();
    const { online, lastSeen } = body;

    const updateData: Record<string, unknown> = {};
    if (typeof online === "boolean") updateData.online = online;
    if (lastSeen !== undefined) updateData.lastSeen = new Date(lastSeen);

    const updated = await prisma.esp32.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        serialNumber: true,
        mqttTopic: true,
        online: true,
        lastSeen: true,
        credits: true,
        mpPosId: true,
        mpPosName: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ...updated, credits: Number(updated.credits) });
  } catch (error) {
    console.error("[esp32/[id] PATCH]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// DELETE /api/esp32/[id] - Remover dispositivo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id,
        machine: { clientId: session.user.id },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Dispositivo não encontrado." }, { status: 404 });
    }

    await prisma.esp32.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[esp32/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
