import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ADM | Garagem System",
    template: "%s | ADM Garagem",
  },
  description: "Gestão da plataforma, assinaturas e unidades do Garagem System.",
  icons: [{ rel: "icon", url: "/garagem-symbol.png" }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
