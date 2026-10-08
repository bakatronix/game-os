import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { acceptInvitation } from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const result = await acceptInvitation(
    token,
    session.user.id,
    session.user.email ?? "",
  );

  return (
    <div className="gos-shell">
      <div className="gos-header">
        <h1>Studio invitation</h1>
      </div>
      <div className="gos-card">
        {result.ok ? (
          <>
            <h2>You&apos;re in.</h2>
            <p className="gos-muted">
              You joined the studio. Your role has been set.
            </p>
            <p style={{ marginTop: 16 }}>
              <Link className="gos-btn" href="/account">
                Go to your account
              </Link>{" "}
              <Link className="gos-btn ghost" href="/admin">
                Open admin
              </Link>
            </p>
          </>
        ) : (
          <>
            <h2>Couldn&apos;t accept this invite</h2>
            <p className="gos-muted">{result.error}</p>
            <p style={{ marginTop: 16 }}>
              <Link className="gos-btn ghost" href="/account">
                Back to account
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
