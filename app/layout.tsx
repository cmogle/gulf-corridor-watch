import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/app/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Keep Calm & Carry On — UAE Airspace & Travel Status",
  description:
    "Live UAE airspace status, flight tracking, and official advisories for residents and travellers during the current crisis.",
  openGraph: {
    title: "Keep Calm & Carry On — UAE Airspace Status",
    description:
      "Live flight data, official advisories, and AI-powered answers for UAE residents and stranded travellers.",
    siteName: "keepcalmandcarryon.help",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&amp;family=DM+Serif+Display&amp;family=JetBrains+Mono:wght@400&amp;display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
