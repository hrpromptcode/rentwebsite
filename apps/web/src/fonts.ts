/**
 * Every Thai-capable font the theme picker offers. Each exposes `--font-<key>`.
 * Browsers only download a font file once text actually uses that family, so declaring
 * all of them costs a few KB of @font-face CSS, not 25 font downloads.
 *
 * next/font requires each loader to be a top-level const with literal options.
 */
import {
  Anuphan,
  Athiti,
  Bai_Jamjuree,
  Chakra_Petch,
  Chonburi,
  Fahkwang,
  IBM_Plex_Sans_Thai,
  Itim,
  K2D,
  Kanit,
  KoHo,
  Kodchasan,
  Krub,
  Maitree,
  Mali,
  Mitr,
  Noto_Sans_Thai,
  Pattaya,
  Pridi,
  Prompt,
  Sarabun,
  Srisakdi,
  Taviraj,
  Thasadith,
  Trirong,
} from "next/font/google";

const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-prompt" });
const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-kanit" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-sarabun" });
const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-noto-sans-thai" });
const ibmPlexSansThai = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-ibm-plex-sans-thai" });
const mitr = Mitr({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-mitr" });
const baiJamjuree = Bai_Jamjuree({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-bai-jamjuree" });
const chakraPetch = Chakra_Petch({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-chakra-petch" });
const anuphan = Anuphan({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-anuphan" });
const k2d = K2D({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-k2d" });
const athiti = Athiti({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-athiti" });
const taviraj = Taviraj({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-taviraj" });
const trirong = Trirong({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-trirong" });
const pridi = Pridi({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-pridi" });
const maitree = Maitree({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-maitree" });
const chonburi = Chonburi({ subsets: ["thai", "latin"], weight: "400", display: "swap", preload: false, variable: "--font-chonburi" });
const srisakdi = Srisakdi({ subsets: ["thai", "latin"], weight: ["400", "700"], display: "swap", preload: false, variable: "--font-srisakdi" });
const mali = Mali({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-mali" });
const itim = Itim({ subsets: ["thai", "latin"], weight: "400", display: "swap", preload: false, variable: "--font-itim" });
const pattaya = Pattaya({ subsets: ["thai", "latin"], weight: "400", display: "swap", preload: false, variable: "--font-pattaya" });
const krub = Krub({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-krub" });
const kodchasan = Kodchasan({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-kodchasan" });
const koho = KoHo({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-koho" });
const fahkwang = Fahkwang({ subsets: ["thai", "latin"], weight: ["300", "400", "500", "600", "700"], display: "swap", preload: false, variable: "--font-fahkwang" });
const thasadith = Thasadith({ subsets: ["thai", "latin"], weight: ["400", "700"], display: "swap", preload: false, variable: "--font-thasadith" });

export const fonts = {
  prompt,
  kanit,
  sarabun,
  "noto-sans-thai": notoSansThai,
  "ibm-plex-sans-thai": ibmPlexSansThai,
  mitr,
  "bai-jamjuree": baiJamjuree,
  "chakra-petch": chakraPetch,
  anuphan,
  k2d,
  athiti,
  taviraj,
  trirong,
  pridi,
  maitree,
  chonburi,
  srisakdi,
  mali,
  itim,
  pattaya,
  krub,
  kodchasan,
  koho,
  fahkwang,
  thasadith,
};

export const fontClassNames = Object.values(fonts)
  .map((f) => f.variable)
  .join(" ");
