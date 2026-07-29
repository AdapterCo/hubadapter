import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { encryptSecret, generateDeviceSecret, hashSecret } from "@/lib/crypto";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

// DELETE /api/admin/devices/[id] - remove a device
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
    const device = await prisma.device.findUnique({
      where: { id },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    await prisma.device.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin/devices/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/devices/[id] - reset device (claimed=false, clientId=null)
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
    const device = await prisma.device.findUnique({
      where: { id },
    });

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const deviceApiKey = generateDeviceSecret();
    const updated = await prisma.$transaction(async (tx) => {
      const linkedEsp = await tx.esp32.findUnique({
        where: { serialNumber: device.idmaq },
        select: { machineId: true },
      });

      if (linkedEsp) {
        await tx.machine.delete({ where: { id: linkedEsp.machineId } });
      }

      return tx.device.update({
        where: { id },
        data: {
          claimed: false,
          clientId: null,
          apiKeyHash: hashSecret(deviceApiKey),
          commandSecret: encryptSecret(deviceApiKey),
        },
        select: {
          id: true,
          idmaq: true,
          claimed: true,
          clientId: true,
          createdAt: true,
        },
      });
    });

    return NextResponse.json({
      ...updated,
      deviceApiKey,
      warning: "A nova chave é exibida apenas nesta resposta.",
    });
  } catch (error) {
    console.error("[admin/devices/[id] PATCH]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
