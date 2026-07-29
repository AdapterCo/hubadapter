import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/esp32 - create a new Esp32
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { machineId, serialNumber } = body;

    if (!machineId || !serialNumber) {
      return NextResponse.json(
        { error: "machineId and serialNumber are required" },
        { status: 400 }
      );
    }

    const cleanSerial = serialNumber.trim().toUpperCase();

    // Validate machineId belongs to the current client
    const machine = await prisma.machine.findFirst({
      where: {
        id: machineId,
        clientId: session.user.id,
      },
    });

    if (!machine) {
      return NextResponse.json(
        { error: "Machine not found or does not belong to client" },
        { status: 404 }
      );
    }

    const provisionedDevice = await prisma.device.findFirst({
      where: {
        idmaq: cleanSerial,
        claimed: true,
        clientId: session.user.id,
        apiKeyHash: { not: null },
        commandSecret: { not: null },
      },
    });
    if (!provisionedDevice) {
      return NextResponse.json(
        { error: "Device is not provisioned or does not belong to this client" },
        { status: 409 }
      );
    }

    // Create esp32 with serialNumber as idmaq/mqttTopic
    const esp32 = await prisma.esp32.create({
      data: {
        machineId,
        serialNumber: cleanSerial,
        mqttTopic: cleanSerial,
        online: false,
        credits: 0,
        apiKeyHash: provisionedDevice.apiKeyHash,
        commandSecret: provisionedDevice.commandSecret,
      },
    });

    return NextResponse.json(
      { ...esp32, credits: Number(esp32.credits) },
      { status: 201 }
    );
  } catch (error) {
    console.error("[esp32 POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
