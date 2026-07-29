import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

// GET /api/admin/clients/[id] - get client details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        webhookToken: true,
        mpAccessToken: false,
        mpWebhookSecret: false,
        machines: {
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
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(client);
  } catch (error) {
    console.error("[admin/clients/[id] GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/clients/[id] - update client (active, mpAccessToken)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { active, mpAccessToken } = body;

    const updateData: Record<string, unknown> = {};
    if (typeof active === "boolean") updateData.active = active;
    if (mpAccessToken !== undefined) {
      if (typeof mpAccessToken !== "string") {
        return NextResponse.json({ error: "Invalid mpAccessToken" }, { status: 400 });
      }
      updateData.mpAccessToken = mpAccessToken.trim() ? encryptSecret(mpAccessToken.trim()) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return NextResponse.json(client);
  } catch (error) {
    console.error("[admin/clients/[id] PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/clients/[id] - delete client
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const client = await prisma.client.findUnique({
      where: { id },
    });

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const esps = await tx.esp32.findMany({
        where: { machine: { clientId: id } },
        select: { id: true },
      });
      await tx.outboxMessage.updateMany({
        where: {
          esp32Id: { in: esps.map((esp) => esp.id) },
          status: { in: ["PENDING", "RETRY"] },
        },
        data: { status: "FAILED", lastError: "Client account deleted" },
      });
      await tx.device.updateMany({
        where: { clientId: id },
        data: { claimed: false, clientId: null },
      });
      await tx.client.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/clients/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
