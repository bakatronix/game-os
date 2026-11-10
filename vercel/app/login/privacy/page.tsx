export const metadata = { title: "Privacy · Game OS" };

const INK = "#2f2a20";
const INK_MUTED = "#655e4b";
const SAND = "#f0e3c3";
const ORANGE_DEEP = "#b84c27";

export default function PrivacyPage() {
  const h2 = { fontSize: 18, margin: "28px 0 8px", color: INK } as const;
  const p = { margin: "0 0 10px", lineHeight: "22px" } as const;
  return (
    <main style={{ minHeight: "100vh", background: SAND, color: INK, padding: "40px 16px" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", fontSize: 15 }}>
        <p style={{ margin: 0 }}>
          <a href="/login" style={{ color: ORANGE_DEEP }}>← Back to sign in</a>
        </p>
        <h1 style={{ fontSize: 30, margin: "16px 0 4px", textTransform: "uppercase" }}>Privacy</h1>
        <p style={{ ...p, color: INK_MUTED }}>How Game OS (by Llama &amp; Griffin) handles your data. Plain language, last updated November 2026.</p>

        <h2 style={h2}>What we store</h2>
        <ul style={{ margin: "0 0 10px 20px", padding: 0, lineHeight: "22px" }}>
          <li>Your name, email and profile picture from Google or Discord, so you can sign in.</li>
          <li>Your studio, its members and roles, and the games you add.</li>
          <li>What you enter in the tools: price calculator workbooks, your publishing thesis, measured signals, Discord playtest settings and scan results.</li>
          <li>Simple usage events (which tool was opened, when) to improve the tools. If you join the waitlist, the email you give is kept separately.</li>
        </ul>

        <h2 style={h2}>What we don&apos;t do</h2>
        <p style={p}>We don&apos;t sell your data and we don&apos;t show ads. Discord bot tokens are encrypted before they are stored and are never sent back to your browser.</p>

        <h2 style={h2}>Where it lives</h2>
        <p style={p}>The app runs on Vercel and the database is Neon Postgres in the United States (AWS us-east-1). Traffic passes through Cloudflare. Sign-in is handled by Google or Discord.</p>

        <h2 style={h2}>Who can see it</h2>
        <p style={p}>Only members of your studio, with the role you give them. Your saved calculator workbook is visible to you only.</p>

        <h2 style={h2}>Deleting your data</h2>
        <p style={p}>
          Email <a href="mailto:abbas@llamagriffin.com" style={{ color: ORANGE_DEEP }}>abbas@llamagriffin.com</a> and we will delete
          your account and everything linked to it.
        </p>
      </div>
    </main>
  );
}
