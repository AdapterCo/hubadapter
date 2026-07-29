import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/esp32/[id] - get esp32 with recent payments
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id: params.id,
        machine: { clientId: session.user.id },
      },
      include: {
        payments: {
          orderBy: { id: "desc" },
          take: 20,
        },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Esp32 not found" }, { status: 404 });
    }

    return NextResponse.json(esp32);
  } catch (error) {
    console.error("[esp32/[id] GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/esp32/[id] - update online status / lastSeen
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id: params.id,
        machine: { clientId: session.user.id },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Esp32 not found" }, { status: 404 });
    }

    const body = await req.json();
    const { online, lastSeen } = body;

    const updateData: Record<string, unknown> = {};
    if (typeof online === "boolean") updateData.online = online;
    if (lastSeen !== undefined) updateData.lastSeen = new Date(lastSeen);

    const updated = await prisma.esp32.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[esp32/[id] PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/esp32/[id] - delete esp32
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const esp32 = await prisma.esp32.findFirst({
      where: {
        id: params.id,
        machine: { clientId: session.user.id },
      },
    });

    if (!esp32) {
      return NextResponse.json({ error: "Esp32 not found" }, { status: 404 });
    }

    await prisma.esp32.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[esp32/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
