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
          radial-gradient(
            circle at 1px 1px,
            rgba(255,255,255,0.12) 1px,
            transparent 0
          )
        `,
        backgroundSize: "22px 22px",
      };

    case "hero-icons":
      return {
        backgroundImage: `
          url("data:image/svg+xml,%3Csvg width='64' height='64' viewBox='0 0 64 64' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 16c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6zm33.414-6l5.95-5.95L45.95.636 40 6.586 34.05.636 32.636 2.05 38.586 8l-5.95 5.95 1.414 1.414L40 9.414l5.95 5.95 1.414-1.414L41.414 8zM40 48c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8zm0-2c3.314 0 6-2.686 6-6s-2.686-6-6-6-6 2.686-6 6 2.686 6 6 6zM9.414 40l5.95-5.95-1.414-1.414L8 38.586l-5.95-5.95L.636 34.05 6.586 40l-5.95 5.95 1.414 1.414L8 41.414l5.95 5.95 1.414-1.414L9.414 40z' fill='%239C92AC' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E")
        `,
        backgroundSize: "64px 64px",
        backgroundColor: "#050505",
      };

    case "lines":
      return {
        backgroundImage: `
          linear-gradient(
            rgba(255,255,255,0.06) 1px,
            transparent 1px
          )
        `,
        backgroundSize: "100% 24px",
      };

    case "grid":
      return {
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
      };

    case "diagonal":
      return {
        backgroundImage: `
          repeating-linear-gradient(
            45deg,
            rgba(255,255,255,0.04),
            rgba(255,255,255,0.04) 2px,
            transparent 2px,
            transparent 14px
          )
        `,
        backgroundSize: "20px 20px",
      };

    case "cyber":
      return {
        backgroundImage: `
          radial-gradient(circle at top left, var(--primary), transparent 45%),
          radial-gradient(circle at bottom right, var(--secondary), transparent 35%)
        `,
        backgroundSize: "cover",
      };

    case "none":
      return {
        backgroundImage: undefined,
        backgroundSize: undefined,
        backgroundColor: "#050505",
      };

    default:
      return {
        backgroundImage: undefined,
        backgroundSize: undefined,
        backgroundColor: "#050505",
      };
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