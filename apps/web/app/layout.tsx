import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NextCrawl — URL to Markdown",
  description:
    "A self-hosted web scraping API. Paste any URL and get clean, LLM-ready markdown instantly. Open-source Firecrawl alternative.",
  keywords: ["web scraping", "markdown", "LLM", "RAG", "Firecrawl alternative"],
  openGraph: {
    title: "NextCrawl",
    description: "URL in, clean markdown out. Self-hosted, no Docker required.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
