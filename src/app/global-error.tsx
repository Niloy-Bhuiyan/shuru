"use client";

/**
 * The last boundary — for when the ROOT LAYOUT itself throws.
 *
 * error.tsx cannot catch that, because it renders inside the layout that
 * failed. This one replaces the whole document, which is why it has to supply
 * its own <html> and <body>.
 *
 * Consequences worth stating, since they are the reason this file looks
 * different from every other component here:
 *
 *  - No `useLang`. The provider lives in the layout that just threw, so
 *    calling it would throw again inside the boundary and hand the user
 *    Next's raw error page. The copy is hardcoded English.
 *  - No Tailwind classes. If the failure was the stylesheet, class names
 *    render as unstyled text. The styles are inline so this screen looks
 *    correct even when nothing else loaded.
 *  - No imports from the app. Every one is a way for this file to fail for
 *    the same reason the page did.
 *
 * In practice this should never be seen. It exists so that the worst case is
 * a plain, calm page rather than an unstyled stack trace.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#F8FAFC",
          color: "#0F172A",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Shuru could not start this page
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 15,
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            Something failed before the app finished loading. Reloading usually
            clears it. If it does not, the problem is on our side.
          </p>

          <div
            style={{
              marginTop: 24,
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                minHeight: 40,
                padding: "0 18px",
                borderRadius: 8,
                border: "none",
                background: "#0F172A",
                color: "#FFFFFF",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/*
              A plain <a>, not next/link, and the lint rule is overruled on
              purpose. next/link does a CLIENT-side navigation through the
              router — the same router living inside the root layout that just
              threw. Using it here risks the escape hatch failing for exactly
              the reason the page did. A full document load is the whole point:
              it throws away the broken client state and starts over.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                minHeight: 40,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 18px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                background: "#FFFFFF",
                color: "#0F172A",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                marginTop: 32,
                fontSize: 12,
                color: "#5F6E85",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
