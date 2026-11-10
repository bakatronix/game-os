/** Where to send someone after sign-in: only same-site paths.
 *  "/game-os/price-calc" passes; "//evil.com", "https://…", "/\\evil" and the
 *  login/auth pages themselves fall back to the dashboard. */
export function safeCallback(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "/game-os";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/game-os";
  if (raw.startsWith("/login") || raw.startsWith("/api/auth")) return "/game-os";
  return raw.slice(0, 500);
}
