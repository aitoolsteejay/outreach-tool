import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// The single typeface for the whole site -- the landing page (app/page.tsx)
// and the dashboard/login tool (app/globals.css) both resolve their heading
// and body font tokens to this same variable, so the two feel like one
// product. Self-hosted via next/font (no external request, no layout
// shift) rather than a Google Fonts <link> tag. IBM Plex Mono stays on its
// own <link> below -- it's used for genuinely monospaced/data display
// (the CSV mockup, connection-note token pills), a different job than the
// site's general typeface.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "Myntmore Outreach";
  const description = "Turn lead lists into real conversations.";
  return { title, description, icons: { icon: { url: "/myntmore-logo.png", type: "image/png" }, shortcut: "/myntmore-logo.png" }, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this rule targets the Pages Router's pages/_document.js; app/layout.tsx is the App Router equivalent and this link is already shared across every route */}
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
