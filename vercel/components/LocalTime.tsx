"use client";

/** Shows a timestamp in the viewer's own time zone ("Nov 14, 3:42 PM"). */
export default function LocalTime({ iso, dateOnly }: { iso: string | null; dateOnly?: boolean }) {
  if (!iso) return <span className="gos-muted">—</span>;
  const d = new Date(iso);
  const text = dateOnly
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <time dateTime={iso} title={d.toString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
