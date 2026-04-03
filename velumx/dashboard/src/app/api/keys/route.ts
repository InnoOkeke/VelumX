import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import crypto from "crypto"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      select: {
        id: true,
        name: true,
        key: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ apiKeys })
  } catch (error: any) {
    console.error("Dashboard API: Failed to fetch API keys:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error.message,
        name: error.name,
        code: error.code, // Useful for Prisma errors (P2021, etc)
        stack: error.stack 
      },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { name } = await req.json()

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: "API key name is required" },
        { status: 400 }
      )
    }

    // Generate a secure random API key
    const key = `vx_${crypto.randomBytes(32).toString("hex")}`

    const apiKey = await prisma.apiKey.create({
      data: {
        userId: user.id,
        name: name.trim(),
        key,
      },
      select: {
        id: true,
        name: true,
        key: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ apiKey })
  } catch (error: any) {
    console.error("Dashboard API: Failed to create API key:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message, stack: error.stack },
      { status: 500 }
    )
  }
}
