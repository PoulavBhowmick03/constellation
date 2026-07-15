import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Treasury Copilot — Live Cockpit",
  description:
    "On-chain bookkeeping for agent businesses. Non-custodial, pay-per-call, live on X Layer. OKX Agent #5863.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Geist (headlines) + Material Symbols via Google Fonts. Inter/JetBrains
            come from next/font. --font-geist is set in globals.css to Geist. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
