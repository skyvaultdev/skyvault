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
import { notFound } from "next/navigation";
import { requireStoreOr404 } from "@/lib/tenant/tenantContext";
import { getSession } from "@/lib/jwt/session";
import { config } from "@/config/configuration";
import { buildOgMetadata } from "@/lib/seo/buildMetadata";

import { resolvePattern } from "@/lib/pattern/patterns";
import ChatWidgetGate from "./(components)/chat/ChatWidgetGate";
import { ModalProvider } from "./(components)/modal/ModalProvider";
import CookieConsentBanner from "./(components)/cookie-consent/CookieConsentBanner";
import AnalyticsScripts from "./(components)/analytics/AnalyticsScripts";

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
  await requireStoreOr404(notFound);
  const db = await getDB();

  const result = await db.query(`SELECT store_name, logo_url FROM store_settings ORDER BY id DESC LIMIT 1`);

  const storeName = result.rows[0]?.store_name ?? "Minha Loja";
  const logoUrl = result.rows[0]?.logo_url as string | null;
  const description = `${storeName} — entrega automática e suporte rápido.`;

  return {
    metadataBase: new URL(config.WEBSITE_URL),
    title: { default: storeName, template: `%s · ${storeName}` },
    description,
    icons: logoUrl
      ? {
          icon: logoUrl,
          shortcut: logoUrl,
          apple: logoUrl,
        }
      : undefined,
    ...buildOgMetadata({ title: storeName, description, image: logoUrl, path: "/", siteName: storeName }),
  }
}

function getBackgroundStyle(type: string, secondary: string, solid?: string | null) {
  return resolvePattern(type, secondary, solid);
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await initApp();
  await requireStoreOr404(notFound);

  const db = await getDB();

  // background_solid_color agora é responsabilidade da migration
  // db/migrations/2026-10-06_store_settings_background_solid_color.sql —
  // isso rodava em TODA página carregada antes (ver auditoria no item 3).
  const result = await db.query(`
    SELECT
      primary_color,
      secondary_color,
      background_style,
      background_img_url,
      background_css,
      background_solid_color,
      store_name,
      legal_name,
      document,
      address,
      contact_email,
      contact_phone
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
    getBackgroundStyle(backgroundType, secondary, theme.background_solid_color);

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
        <ModalProvider>
          <div className="transparency-box" />

          <div className="page-wrapper">
            <Header />

            <Suspense fallback={null}>
              <LoadingHandler />
            </Suspense>

            <main className="main-content">
              {children}
            </main>

            <Footer
              storeName={theme.store_name ?? "Minha Loja"}
              isLoggedIn={!!session}
              legalName={theme.legal_name ?? null}
              document={theme.document ?? null}
              address={theme.address ?? null}
              contactEmail={theme.contact_email ?? null}
              contactPhone={theme.contact_phone ?? null}
              platformName={config.platform.legalName}
            />
          </div>

          <ChatWidgetGate isLoggedIn={!!session} />
          <CookieConsentBanner />
          <AnalyticsScripts ga4MeasurementId={config.analytics.ga4MeasurementId} metaPixelId={config.analytics.metaPixelId} />

          {backgroundCss && (
            <style
              dangerouslySetInnerHTML={{
                __html: backgroundCss,
              }}
            />
          )}
        </ModalProvider>
      </body>
    </html>
  );
}