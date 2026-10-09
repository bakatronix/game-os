import { handlers } from "@/auth";
import type { NextRequest } from "next/server";

/* Diagnostic wrapper: log the OAuth callback request shape and the response
 * so we can see the exact server-side failure (temporary; remove once fixed). */
async function traced(req: NextRequest, method: "GET" | "POST") {
  const url = new URL(req.url);
  const isCallback = url.pathname.includes("/callback/");
  if (isCallback) {
    const cookie = req.headers.get("cookie") || "";
    const hasNames = ["pkce.code_verifier", "csrf-token", "state", "callback-url"]
      .map((n) => `${n}=${cookie.includes(n) ? "Y" : "N"}`)
      .join(" ");
    console.log(
      `[cb] ${method} ${url.pathname}${url.search.slice(0, 60)} | host=${req.headers.get("host")} xfh=${req.headers.get("x-forwarded-host")} | cookies[${hasNames}]`,
    );
  }
  const res = method === "GET" ? await handlers.GET(req) : await handlers.POST(req);
  if (isCallback) {
    console.log(`[cb-res] status=${res.status} location=${res.headers.get("location") || "-"}`);
  }
  return res;
}

export const GET = (req: NextRequest) => traced(req, "GET");
export const POST = (req: NextRequest) => traced(req, "POST");
