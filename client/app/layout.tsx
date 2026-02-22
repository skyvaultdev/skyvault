import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./(components)/header/header.css";
import Header from "./(components)/header/page";
import "./(components)/footer/footer.css";
import Footer from "./(components)/footer/page";

import "./globals.css";

import { initApp } from "@/lib/database/init";
import { getDB } from "@/lib/database/db";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {

  await initApp();

  const db = getDB();
  const result = await db.query(`
    SELECT primary_color, secondary_color, background_style, background_img_url, background_css
    FROM store_settings
    ORDER BY id DESC
    LIMIT 1
  `);

  const theme = result.rows[0] ?? {};

  const primary = theme.primary_color ?? "#b700ff";
  const secondary = theme.secondary_color ?? "#6400ff";
  const backgroundType = theme.background_style ?? "lines";
  const backgroundImg = theme.background_img_url ?? null;
  const backgroundCss = theme.background_css ?? null;

  return (
    <html
      lang="en"
      style={{
        ["--primary" as any]: primary,
        ["--secondary" as any]: secondary,
      }}
    >
      <body
        data-store-background={backgroundType}
        style={{
          backgroundImage: backgroundImg ? `url(${backgroundImg})` : undefined,
          backgroundSize: backgroundImg ? "cover" : undefined,
          backgroundPosition: backgroundImg ? "center" : undefined,
        }}
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        {children}
        <div className="background" />
        <Footer />

        {backgroundCss && (
          <style id="store-custom-background">
            {`body { ${backgroundCss} }`}
          </style>
        )}
      </body>
    </html>
  );
}