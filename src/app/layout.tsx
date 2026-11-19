import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AppProvider } from "@/components/app-context";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "4ORGE — QIE deployment workspace", template: "%s · 4ORGE" },
  description: "Compile, test, deploy and manage smart contracts on QIE Blockchain with reusable, wallet-authorized Runbooks.",
  icons: { icon: "/icon.svg" },
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
