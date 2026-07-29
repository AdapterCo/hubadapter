import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET /api/machines - list all machines for the current client
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const machines = await prisma.machine.findMany({
      where: { clientId: session.user.id },
      include: {
        esps: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(machines);
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
