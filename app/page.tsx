import type { Metadata } from "next";
import StartupLoader from "./StartupLoader";

export const metadata: Metadata = {
  title: "Ателье Анны — уютная игра",
  description: "Ухаживайте за Анной, собирайте материалы и выполняйте заказы в уютном ателье.",
};

export default function Home() {
  return <StartupLoader />;
}
