import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/machines/[id] - Obter detalhes de uma máquina
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const machine = await prisma.machine.findFirst({
      where: {
        id,
        clientId: session.user.id,
      },
      include: {
        esps: {
          orderBy: { serialNumber: "asc" },
        },
      },
    });

    if (!machine) {
      return NextResponse.json({ error: "Máquina não encontrada." }, { status: 404 });
    }

    const now = Date.now();
    // Heartbeat a cada 30s. Se lastSeen > 90s atrás, considera OFFLINE.
    const ONLINE_THRESHOLD_MS = 90 * 1000;

    const formattedMachine = {
      ...machine,
      esps: machine.esps.map((e) => {
        const isRecentlyActive = e.lastSeen
          ? now - new Date(e.lastSeen).getTime() <= ONLINE_THRESHOLD_MS
          : false;
        return {
          ...e,
          credits: Number(e.credits),
          online: isRecentlyActive,
        };
      }),
    };

    return NextResponse.json(formattedMachine);
  } catch (error) {
    console.error("[machines/[id] GET]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// PATCH /api/machines/[id] - Editar nome e localização da máquina
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const machine = await prisma.machine.findFirst({
      where: {
        id,
        clientId: session.user.id,
      },
    });

    if (!machine) {
      return NextResponse.json({ error: "Máquina não encontrada." }, { status: 404 });
    }

    const body = await req.json();
    const { name, location } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "O nome da máquina é obrigatório." },
        { status: 400 }
      );
    }

    const updated = await prisma.machine.update({
      where: { id },
      data: {
        name: name.trim(),
        location: location !== undefined ? (location ? String(location).trim() : null) : machine.location,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[machines/[id] PATCH]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

// DELETE /api/machines/[id] - Excluir uma máquina
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const machine = await prisma.machine.findFirst({
      where: {
        id,
        clientId: session.user.id,
      },
    });

    if (!machine) {
      return NextResponse.json({ error: "Máquina não encontrada." }, { status: 404 });
    }

    await prisma.machine.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[machines/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
