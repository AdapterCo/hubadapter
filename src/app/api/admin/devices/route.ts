import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  if (session.user.role !== "ADMIN") return null;
  return session;
}

// GET /api/admin/devices - all Device records
export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const devices = await prisma.device.findMany({
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { idmaq: "asc" },
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error("[admin/devices GET]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/devices - add single or bulk devices
export async function POST(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();

    // Bulk add: { idmaqs: string[] }
    if (Array.isArray(body.idmaqs)) {
      const idmaqs: string[] = body.idmaqs.filter(
        (v: unknown) => typeof v === "string" && v.trim() !== ""
      );

      if (idmaqs.length === 0) {
        return NextResponse.json(
          { error: "idmaqs array is empty or invalid" },
          { status: 400 }
        );
      }

      let createdCount = 0;
      for (const idmaq of idmaqs) {
        try {
          await prisma.device.create({
            data: { idmaq: idmaq.trim(), claimed: false },
          });
          createdCount++;
        } catch {
          // Ignore duplicate entries gracefully
        }
      }

      return NextResponse.json(
        { created: createdCount, skippedDuplicates: idmaqs.length - createdCount },
        { status: 201 }
      );
    }

    // Single add: { idmaq: string }
    const { idmaq } = body;
    if (!idmaq || typeof idmaq !== "string" || idmaq.trim() === "") {
      return NextResponse.json(
        { error: "idmaq is required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.create({
      data: { idmaq: idmaq.trim(), claimed: false },
    });

    return NextResponse.json(device, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Device with this idmaq already exists" },
        { status: 409 }
      );
    }
    console.error("[admin/devices POST]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
