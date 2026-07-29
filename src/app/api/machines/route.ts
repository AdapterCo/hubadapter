import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/machines - list all machines for the current client
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const machines = await prisma.machine.findMany({
      where: { clientId: session.user.id },
      include: {
        esps: {
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
        },
      },
      orderBy: { name: "asc" },
    });

    const now = Date.now();
    const TEN_MINUTES_MS = 10 * 60 * 1000;

    const formattedMachines = machines.map((m) => ({
      ...m,
      esps: m.esps.map((e) => {
        const isRecentlyActive = e.lastSeen
          ? now - new Date(e.lastSeen).getTime() < TEN_MINUTES_MS
          : false;
        return {
          ...e,
          credits: Number(e.credits),
          online: isRecentlyActive,
        };
      }),
    }));

    return NextResponse.json(formattedMachines);
  } catch (error) {
    console.error("[machines GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/machines - create a new machine for the current client
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, location } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Machine name is required" },
        { status: 400 }
      );
    }

    const machine = await prisma.machine.create({
      data: {
        clientId: session.user.id,
        name: name.trim(),
        location: location ?? null,
      },
    });

    return NextResponse.json(machine, { status: 201 });
  } catch (error) {
    console.error("[machines POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
