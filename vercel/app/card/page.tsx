import type { Metadata } from "next";
import "./card.css";

// Public "link in bio" page for Abbas's visiting cards.
// The printed QR code points at https://llamagriffin.com/card, so this path
// must never move. Edit the LINKS list below to change what shows.

export const metadata: Metadata = {
  title: "Abbas Saleem · Llama & Griffin",
  description:
    "Strategic advisory for game studios, publishers and creative investors.",
  openGraph: {
    title: "Abbas Saleem · Llama & Griffin",
    description:
      "Strategic advisory for game studios, publishers and creative investors.",
    url: "https://llamagriffin.com/card",
    images: ["https://llamagriffin.com/card/abbas.png"],
  },
};

const LINKS: { label: string; sub: string; href: string; icon: keyof typeof ICONS; primary?: boolean }[] = [
  {
    label: "Book a call",
    sub: "30-minute conversation",
    href: "https://cal.com/llamagriffin/30min",
    icon: "calendar",
    primary: true,
  },
  {
    label: "Llama & Griffin",
    sub: "llamagriffin.com",
    href: "https://llamagriffin.com",
    icon: "globe",
  },
  {
    label: "Recognizing Patterns",
    sub: "My Substack",
    href: "https://recognizingpatterns.substack.com",
    icon: "pen",
  },
  {
    label: "LinkedIn",
    sub: "linkedin.com/in/abbask",
    href: "https://linkedin.com/in/abbask",
    icon: "linkedin",
  },
  {
    label: "Email",
    sub: "hello@llamagriffin.com",
    href: "mailto:hello@llamagriffin.com",
    icon: "mail",
  },
];

const ICONS = {
  calendar: (
    <path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  ),
  globe: (
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z" />
  ),
  pen: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  linkedin: (
    <path d="M5 9v10M5 5v.01M10 19v-6a3 3 0 0 1 6 0v6M10 9v10M16 13v6M19 19v-6a4 4 0 0 0-4-4h-.5" />
  ),
  mail: <path d="M4 6h16v12H4V6Zm0 0 8 7 8-7" />,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="card-icon">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </g>
    </svg>
  );
}

export default function CardPage() {
  return (
    <main className="card-page">
      <div className="card-wrap">
        <header className="card-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/card/abbas.png" alt="Abbas Saleem" width={112} height={112} className="card-photo" />
          <h1 className="card-name">Abbas Saleem</h1>
          <p className="card-role">Llama &amp; Griffin</p>
          <p className="card-tag">
            Strategic advisory for game studios, publishers and creative investors.
            25+ years across games, transmedia and studio strategy.
          </p>
        </header>

        <nav className="card-links" aria-label="Links">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={l.primary ? "card-link card-link--primary" : "card-link"}
              {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener" } : {})}
            >
              <Icon name={l.icon} />
              <span className="card-link-text">
                <span className="card-link-label">{l.label}</span>
                <span className="card-link-sub">{l.sub}</span>
              </span>
              <span className="card-arrow" aria-hidden="true">→</span>
            </a>
          ))}
        </nav>

        <a href="/card/abbas-saleem.vcf" className="card-save">
          Save my contact
        </a>

        <footer className="card-foot">▲▲▲▲ Llama &amp; Griffin</footer>
      </div>
    </main>
  );
}
