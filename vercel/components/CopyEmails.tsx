"use client";

import { useState } from "react";

/** Copies a list of email addresses, comma-separated, ready to paste into Bcc. */
export default function CopyEmails({ emails }: { emails: string[] }) {
  const [done, setDone] = useState<"" | "ok" | "err">("");
  if (!emails.length) return null;
  return (
    <button
      type="button"
      className="gos-btn"
      onClick={() => {
        navigator.clipboard.writeText(emails.join(", ")).then(
          () => setDone("ok"),
          () => setDone("err"),
        );
      }}
    >
      {done === "ok" ? `Copied ${emails.length} emails` : done === "err" ? "Couldn't copy" : `Copy ${emails.length} emails`}
    </button>
  );
}
