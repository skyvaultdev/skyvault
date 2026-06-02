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

import { PATTERNS, type Pattern } from "@/lib/pattern/patterns";

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
  const validType = (type in PATTERNS)? type as Pattern : "none";
  const pattern = PATTERNS[validType];
  return {
    backgroundImage: pattern.backgroundImage,
    backgroundSize: pattern.backgroundSize,
    backgroundColor: pattern.backgroundColor ?? undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await initApp();

  const db = getDB();

  const result = await db.query(`
    SELECT
      primary_color,
      secondary_color,
      background_style,
      background_img_url,
      background_css
    FROM store_settings
    ORDER BY id DESC
    LIMIT 1
  `);

  const theme = result.rows[0] ?? {};

  const primary =
    theme.primary_color ?? "#b700ff";

  const secondary =
    theme.secondary_color ?? "#6400ff";

  const backgroundType =
    theme.background_style ?? "hero-icons";

  const backgroundImg =
    theme.background_img_url ?? null;

  const backgroundCss =
    theme.background_css ?? null;

  const bgStyle =
    getBackgroundStyle(backgroundType);

  const patternImage =
    bgStyle.backgroundImage;

  const patternSize =
    bgStyle.backgroundSize;

  const backgroundColor =
    bgStyle.backgroundColor ?? "#050505";

  const finalBackgroundImage = backgroundImg
    ? patternImage
      ? `${patternImage}, url(${backgroundImg})`
      : `url(${backgroundImg})`
    : patternImage;

  const finalBackgroundSize = backgroundImg
    ? patternImage
      ? `${patternSize}, cover`
      : "cover"
    : patternSize;

  const finalBackgroundRepeat = backgroundImg
    ? patternImage
      ? "repeat, no-repeat"
      : "no-repeat"
    : "repeat";

  const finalBackgroundPosition = backgroundImg
    ? patternImage
      ? "top left, center center"
      : "center center"
    : undefined;

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
          backgroundColor,

          backgroundImage:
            finalBackgroundImage,

          backgroundSize:
            finalBackgroundSize,

          backgroundRepeat:
            finalBackgroundRepeat,

          backgroundPosition:
            finalBackgroundPosition,

          backgroundAttachment: "fixed",

          minHeight: "100vh",

          overflowX: "hidden",
        }}
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
        `}
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

        {backgroundCss && (
          <style
            dangerouslySetInnerHTML={{
              __html: backgroundCss,
            }}
          />
        )}
      </body>
    </html>
  );
}