import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gtm-xray: reverse-engineer any startup's GTM",
  description:
    "Point gtm-xray at any startup and get an evidence-backed teardown of how they get customers: positioning, pricing, channels, acquisition loops. Every claim carries its sources and confidence level.",
  icons: {
    icon: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="14" cy="14" r="9" fill="none" stroke="#2563eb" stroke-width="3"/><line x1="21" y1="21" x2="29" y2="29" stroke="#111827" stroke-width="3" stroke-linecap="round"/><circle cx="14" cy="14" r="2.5" fill="#2563eb"/></svg>`
    ),
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <a href="/" className="brand" style={{ textDecoration: "none" }}>
              gtm<span>-xray</span>
            </a>
            <nav className="site">
              <a href="/sample">Sample teardown</a>
              <a href="https://github.com/richardsondx/gtm-xray">GitHub</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site">
          <div className="wrap">
            <span>Designed and engineered in Toronto by Richardson Dackam</span>
            <span>
              <a href="https://x.com/richardsondx">X</a>
              <a href="https://github.com/richardsondx">GitHub</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
