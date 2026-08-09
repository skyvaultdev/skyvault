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
import { getSession } from "@/lib/jwt/session";

import { PATTERNS, type Pattern } from "@/lib/pattern/patterns";
import ChatWidgetGate from "./(components)/chat/ChatWidgetGate";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  await initApp();
  const db = await getDB();

  const result = await db.query(`
SELECT store_name, logo_url FROM store_settings ORDER BY id DESC LIMIT 1`);

  const storeName = result.rows[0]?.store_name ?? "Minha Loja";
  const logoUrl = result.rows[0]?.logo_url;

  return {
    title: storeName,
    description: ` ${storeName} Where your dreams come true! `,
    icons: logoUrl
      ? {
          icon: logoUrl,
          shortcut: logoUrl,
          apple: logoUrl,
        }
      : undefined,
  }
}

function getBackgroundStyle(type: string) {
  const validType = (type in PATTERNS) ? type as Pattern : "none";
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

  const db = await getDB();

  const result = await db.query(`
    SELECT
      primary_color,
      secondary_color,
      background_style,
      background_img_url,
      background_css,
      store_name  
    FROM store_settings
    ORDER BY id DESC
    LIMIT 1
  `);

  var theme = result.rows[0] ?? {};

  var primary =
    theme.primary_color ?? "#b700ff";

  var secondary =
    theme.secondary_color ?? "#6400ff";

  var backgroundType =
    theme.background_style ?? "heroicons";

  var backgroundImg =
    theme.background_img_url ?? null;

  var backgroundCss =
    theme.background_css ?? null;

  var bgStyle =
    getBackgroundStyle(backgroundType);

  var patternImage =
    bgStyle.backgroundImage;

  var patternSize =
    bgStyle.backgroundSize;

  var backgroundColor =
    bgStyle.backgroundColor ?? "#050505";

  var finalBackgroundImage = backgroundImg
    ? patternImage
      ? `${patternImage}, url(${backgroundImg})`
      : `url(${backgroundImg})`
    : patternImage;

  var finalBackgroundSize = backgroundImg
    ? patternImage
      ? `${patternSize}, cover`
      : "cover"
    : patternSize;

  var finalBackgroundRepeat = backgroundImg
    ? patternImage
      ? "repeat, no-repeat"
      : "no-repeat"
    : "repeat";

  var finalBackgroundPosition = backgroundImg
    ? patternImage
      ? "top left, center center"
      : "center center"
    : undefined;

  const session = await getSession();

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

        <ChatWidgetGate isLoggedIn={!!session} />

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