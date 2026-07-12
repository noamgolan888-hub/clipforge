import { useLocation } from "react-router-dom";

const titles: Record<string, string> = {
  "/": "Overview",
  "/clipper": "Smart Clipper",
  "/beat-sync": "Beat-Synced Edit",
  "/highlights": "Sports Highlights",
};

export function TopBar() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? "ClipForge";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-8">
      <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
        <span>ClipForge</span>
        <span>/</span>
        <span className="text-text-primary">{title}</span>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-bg-elevated px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_1px] shadow-success/60" />
        <span className="text-[12px] text-text-secondary">Engine Online</span>
      </div>
    </header>
  );
}
