import Link from "next/link";

const ANALYTICS_TABS: { key: string; href: string; label: string }[] = [
  { key: "funnel", href: "/admin/analytics", label: "Funnel" },
  { key: "partners", href: "/admin/analytics/partners", label: "Partners" },
  { key: "engagement", href: "/admin/analytics/engagement", label: "Engagement" },
  { key: "attribution", href: "/admin/analytics/attribution", label: "Attribution" },
];

export default function GosShell({
  title,
  active,
  subnav,
  children,
}: {
  title: string;
  active: "account" | "admin" | "dashboard";
  subnav?: "funnel" | "partners" | "engagement" | "attribution";
  children: React.ReactNode;
}) {
  const tabs: { key: string; href: string; label: string }[] = [
    { key: "dashboard", href: "/game-os", label: "Dashboard" },
    { key: "account", href: "/account", label: "Account" },
    { key: "admin", href: "/admin", label: "Admin" },
    { key: "admin", href: "/admin/analytics", label: "Analytics" },
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
