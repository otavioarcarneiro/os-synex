import logo from "@/assets/synex_logo_white.png.asset.json";
import mark from "@/assets/synex_sn_mark.png.asset.json";
export function SynexLogo({ className }: { className?: string }) {
  return <img src={logo.url} alt="Synex Digital Presence" className={className} />;
}
export function SynexMark({ className }: { className?: string }) {
  return <img src={mark.url} alt="Synex" className={className} />;
}
