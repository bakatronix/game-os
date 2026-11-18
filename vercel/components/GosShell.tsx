import Link from "next/link";
import { auth } from "@/auth";
import { isPlatformAdmin } from "@/lib/admin";

const ANALYTICS_TABS: { key: string; href: string; label: string }[] = [
  { key: "people", href: "/admin/analytics/people", label: "People" },
  { key: "funnel", href: "/admin/analytics", label: "Funnel" },
  { key: "partners", href: "/admin/analytics/partners", label: "Partners" },
  { key: "engagement", href: "/admin/analytics/engagement", label: "Engagement" },
  { key: "attribution", href: "/admin/analytics/attribution", label: "Attribution" },
  { key: "feedback", href: "/admin/analytics/feedback", label: "Feedback" },
];

export default async function GosShell({
  title,
  active,
  subnav,
  children,
}: {
  title: string;
  active: "account" | "admin" | "dashboard" | "analytics";
  subnav?: "people" | "funnel" | "partners" | "engagement" | "attribution" | "feedback";
  children: React.ReactNode;
}) {
  // Analytics is for platform admins only; studio owners still see Admin.
  const session = await auth();
  const admin = isPlatformAdmin(session?.user?.id);
  const tabs: { key: string; href: string; label: string }[] = [
    { key: "dashboard", href: "/game-os", label: "Dashboard" },
    { key: "account", href: "/account", label: "Account" },
    { key: "admin", href: "/admin", label: "Admin" },
    ...(admin ? [{ key: "analytics", href: "/admin/analytics/people", label: "Analytics" }] : []),
  ];
  return (
    <div className="gos-shell">
      <div className="gos-header">
        <div>
          <h1>{title}</h1>
          <nav className="gos-nav">
            {tabs.map((t) => (
              <Link
                key={`${t.key}-${t.href}`}
                href={t.href}
                className={t.key === active ? "active" : ""}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {subnav && (
            <nav className="gos-nav" style={{ marginTop: 10, opacity: 0.95 }}>
              {ANALYTICS_TABS.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  className={t.key === subnav ? "active" : ""}
                  style={{ fontSize: 12 }}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
