import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    const apiKey = await (prisma.apiKey as any).findUnique({
      where: { id },
    })

    if (!apiKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (apiKey.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await (prisma.apiKey as any).update({
      where: { id },
      data: { revokedAt: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to revoke API key:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    const apiKey = await (prisma.apiKey as any).findUnique({
      where: { id },
    })

    if (!apiKey) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }

    if (apiKey.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updatedKey = await (prisma.apiKey as any).update({
      where: { id },
      data: {
        sponsorshipPolicy: body.sponsorshipPolicy,
        markupPercentage: body.markupPercentage !== undefined ? parseInt(body.markupPercentage) : undefined,
        maxSponsoredTxsPerUser: body.maxSponsoredTxsPerUser !== undefined ? parseInt(body.maxSponsoredTxsPerUser) : undefined,
        monthlyLimitUsd: body.monthlyLimitUsd !== undefined ? parseFloat(body.monthlyLimitUsd) : undefined,
        supportedGasTokens: body.supportedGasTokens !== undefined ? body.supportedGasTokens : undefined,
      },
    })

    return NextResponse.json(updatedKey)
  } catch (error) {
    console.error("Failed to update API key:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
