/** Where to send someone after sign-in: only same-site paths.
 *  "/game-os/price-calc" passes; "//evil.com", "https://…", "/\\evil" and the
 *  login/auth pages themselves fall back to the dashboard. */
export function safeCallback(raw: string | undefined | null): string {
  if (!raw || typeof raw !== "string") return "/game-os";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/game-os";
  if (raw.startsWith("/login") || raw.startsWith("/api/auth")) return "/game-os";
  return raw.slice(0, 500);
}

const TOOL_NAMES: [string, string][] = [
  ["/game-os/price-calc", "the Pricing Calculator"],
  ["/game-os/chicken-brulee", "Chicken Brûlée, the Discord playtest scanner"],
  ["/game-os/PMF", "the PMF Analyzer"],
  ["/game-os/steam-page-audit", "Steam Page Audit"],
  ["/game-os/thesis-builder", "Thesis Builder"],
  ["/seismic", "Seismic"],
];
/** What the sign-in page should say it opens, from the safe callback path. */
export function toolNameFor(path: string): string | null {
  const hit = TOOL_NAMES.find(([p]) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?") || path.startsWith(p + "#"));
  return hit ? hit[1] : null;
}
