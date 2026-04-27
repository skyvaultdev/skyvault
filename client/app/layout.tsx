import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import LoadingHandler from "./(components)/loader/LoadingHandler";
import { Suspense } from "react";

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
};

function getBackgroundStyle(type: string) {
  switch (type) {
    case "dots":
      return {
        backgroundImage: `
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)
        `,
        backgroundSize: "20px 20px",
      };

    case "lines":
      return {
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      };

    case "grid":
      return {
        backgroundImage: `
          linear-gradient(#ffffff10 1px, transparent 1px),
          linear-gradient(90deg, #ffffff10 1px, transparent 1px)
        `,
        backgroundSize: "25px 25px",
      };

    case "none":
      return {};

    default:
      return {};
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
  const bgStyle = getBackgroundStyle(backgroundType);

  const patternImage = bgStyle.backgroundImage;
  const patternSize = bgStyle.backgroundSize;

  return (
    <html
      lang="pt-BR"
      style={{
        ["--primary" as any]: primary,
        ["--secondary" as any]: secondary,
      }}
    >
      <body
        data-store-background={backgroundType}
        style={{
          backgroundImage: backgroundImg
            ? `${patternImage}, url(${backgroundImg})`
            : patternImage,

          backgroundSize: backgroundImg
            ? `${patternSize}, cover`
            : patternSize,

          backgroundPosition: backgroundImg
            ? `top left, center`
            : undefined,
        }}
        className={`${geistSans.variable} ${geistMono.variable}`}
      >

        <div className="transparency-box" />
        <div className="page-wrapper">
          <Header />
          <Suspense fallback={null}>
            <LoadingHandler />
          </Suspense>
          <main className="main-content">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}