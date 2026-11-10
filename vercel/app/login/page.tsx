import { signIn } from "@/auth";
import { safeCallback, toolNameFor } from "@/lib/safe-callback";

const SAND = "#f0e3c3";
const SAND_DEEP = "#e6d6b7";
const INK = "#2f2a20";
const INK_MUTED = "#655e4b";
const CREAM = "#fbf1dc";
const TEAL = "#3b8d83";
const ORANGE = "#e3683f";
const ORANGE_DEEP = "#b84c27";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const redirectTo = safeCallback((await searchParams).callbackUrl);
  const tool = toolNameFor(redirectTo);
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        background: SAND,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 6,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 8,
              height: 28,
              borderRadius: 3,
              background: TEAL,
            }}
          />
          <span
            style={{
              width: 8,
              height: 28,
              borderRadius: 3,
              background: ORANGE,
            }}
          />
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: "36px",
            fontWeight: 800,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            color: TEAL,
          }}
        >
          Game OS
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 15,
            color: INK_MUTED,
          }}
        >
          {tool ? `Sign in to open ${tool}.` : "Sign in to open your studio dashboard."}
        </p>
        <p
          style={{
            margin: "6px auto 0",
            maxWidth: 380,
            fontSize: 13,
            color: INK_MUTED,
          }}
        >
          Game OS is a set of tools from Llama &amp; Griffin that helps indie studios price, test and launch
          their games.
        </p>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo });
          }}
        >
          <button type="submit" style={buttonStyle(ORANGE_DEEP, CREAM)}>
            Continue with Google
          </button>
        </form>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo });
          }}
        >
          <button type="submit" style={buttonStyle(TEAL, CREAM)}>
            Continue with Discord
          </button>
        </form>
      </div>

      <p style={{ fontSize: 12, color: INK_MUTED, maxWidth: 360, textAlign: "center" }}>
        We only use your Google or Discord name and email to sign you in. Read our{" "}
        <a href="/login/privacy" style={{ color: ORANGE_DEEP }}>
          privacy policy
        </a>
        .
      </p>
    </main>
  );
}

function buttonStyle(bg: string, fg: string): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    fontFamily: "inherit",
    fontSize: 15,
    fontWeight: 700,
    color: fg,
    background: bg,
    border: `1px solid ${bg}`,
    borderRadius: 3,
    cursor: "pointer",
  };
}
