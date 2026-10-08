import Link from "next/link";

export default function GosShell({
  title,
  active,
  children,
}: {
  title: string;
  active: "account" | "admin" | "dashboard";
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
                key={t.key}
                href={t.href}
                className={t.key === active ? "active" : ""}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
