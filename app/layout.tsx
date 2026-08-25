import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://atelier-anny.opgbalagan.chatgpt.site"),
  title: "Ателье Анны",
  description: "Уютная игра про швею, заботу и выполнение заказов.",
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
