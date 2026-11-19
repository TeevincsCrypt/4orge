import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AppProvider } from "@/components/app-context";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute URLs for the social card (og:image) once deployed.
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL) : undefined,
  title: { default: "4ORGE — QIE deployment workspace", template: "%s · 4ORGE" },
  description: "Compile, test, deploy and manage smart contracts on QIE Blockchain with reusable, wallet-authorized Runbooks.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/brand/4orge-icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#09090c", colorScheme: "dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AppProvider>
          <WalletProvider>{children}</WalletProvider>
        </AppProvider>
      </body>
    </html>
  );
}
