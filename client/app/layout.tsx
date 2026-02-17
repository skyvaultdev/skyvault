import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./(components)/header/header.css";
import Header from "./(components)/header/page";
import "./(components)/footer/footer.css";
import Footer from "./(components)/footer/page";

import "./globals.css";
import { initApp } from "@/lib/database/init";
import StoreThemeLoader from "./(components)/therme/StoreThemeLoader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sky Vault | Our Pre-Alpha",
  description: "Where all your dreams come true",
  icons: {
    icon: "/download.jpg",
  }
};

export default async function RootLayout({ children,}: Readonly<{children: React.ReactNode;}>) {
  await initApp();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <StoreThemeLoader />
        <Header />
        {children}
        <div className="background">
        </div>
        <Footer />
      </body>
    </html>
  );
}
