import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Nav from "./components/Nav";
import CommandPalette from "./components/CommandPalette";
import { ToastProvider } from "./components/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Agent Council",
  description: "Run structured meetings between your Claude Code agents. Watch them deliberate in real time.",
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: 'Agent Council',
    description: 'Run structured meetings between your Claude Code agents. Watch them deliberate in real time.',
    type: 'website',
    siteName: 'Agent Council',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="alternate" type="application/rss+xml" title="Agent Council Meetings" href="/api/meetings/feed" />
      </head>
      <body className="min-h-screen antialiased">
        <ToastProvider>
          <Nav />
          <CommandPalette />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
