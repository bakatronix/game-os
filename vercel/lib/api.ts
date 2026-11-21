import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { AccessError } from "@/lib/spine";

/** Signed-in user or a 401 response. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  }
  return { user: session.user } as const;
}

export async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const b = await req.json();
    return b && typeof b === "object" ? b : {};
  } catch {
    return {};
  }
}

/** Map thrown errors to JSON responses (AccessError keeps its status). */
export function apiError(err: unknown) {
  if (err instanceof AccessError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api]", err);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

export const noStore = { headers: { "Cache-Control": "no-store" } };
