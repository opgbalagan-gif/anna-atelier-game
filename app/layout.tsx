import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#b75f65",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://atelier-anny.opgbalagan.chatgpt.site"),
  title: "Ателье Анны",
  description: "Уютная игра про швею, заботу и выполнение заказов.",
  applicationName: "Ателье Анны",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ателье Анны",
  },
  openGraph: {
    title: "Ателье Анны",
    description: "Уютная история мастерской",
    images: [{ url: "/og.png", width: 1672, height: 941, alt: "Ателье Анны — уютная история мастерской" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ателье Анны",
    description: "Уютная история мастерской",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
