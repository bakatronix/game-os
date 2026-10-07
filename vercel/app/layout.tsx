import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Game OS",
  description: "Llama & Griffin operator surface for indie studio executives.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '"Archivo", "Arial Black", system-ui, sans-serif',
          background: "#f0e3c3",
          color: "#2f2a20",
        }}
      >
        {children}
      </body>
    </html>
  );
}
