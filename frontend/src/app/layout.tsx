import type { Metadata } from "next";
import { Inter, Syne, Playfair_Display } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ClaimRidge • AI Insurance Compliance Layer",
  description:
    "AI-powered compliance layer that ensures medical claims meet each payer's exact requirements before submission, reducing denials for providers and review costs for insurers.",
  icons: {
    icon: "/logo-claim-ridge.svg",
    shortcut: "/logo-claim-ridge.svg",
    apple: "/logo-claim-ridge.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${syne.variable} ${playfair.variable}`}>
      <body className="antialiased min-h-screen flex flex-col bg-white text-[#0a0a0a]">
        <Navbar />
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
