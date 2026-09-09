import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "Myntmore Outreach";
  const description = "Turn lead lists into real conversations.";
  return { title, description, icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" }, openGraph: { title, description, images: [image] }, twitter: { card: "summary_large_image", title, description, images: [image] } };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Fraunces/Manrope/IBM Plex Mono -- shared by the marketing landing
            page at "/" (app/page.tsx) AND the dashboard/login tool
            (app/globals.css), so the two feel like one product instead of a
            marketing page bolted onto a differently-fonted app. Loaded
            app-wide here rather than per page since React hoists <link>
            tags to <head> regardless of where they're rendered, and unused
            @font-face rules on other routes cost nothing until a matching
            font-family is used. Fraunces' weight axis goes up to 800 (not
            just the landing page's own 400..600) because the dashboard's
            headings render at font-weight:800. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- this rule targets the Pages Router's pages/_document.js; app/layout.tsx is the App Router equivalent and this link is already shared across every route */}
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..800&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
