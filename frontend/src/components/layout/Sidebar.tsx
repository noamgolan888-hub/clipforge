import { NavLink } from "react-router-dom";
import { LayoutGrid, Scissors, AudioLines, Trophy, Sparkles, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Overview", icon: LayoutGrid, end: true },
  { to: "/clipper", label: "Smart Clipper", icon: Scissors },
  { to: "/beat-sync", label: "Beat-Synced Edit", icon: AudioLines },
  { to: "/highlights", label: "Sports Highlights", icon: Trophy },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-bg-secondary/40">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#a855f7] shadow-[0_0_20px_-4px_rgba(124,92,255,0.6)]">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="font-display text-[16px] font-bold tracking-tight text-text-primary">
          ClipForge
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          Tools
        </p>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                isActive
                  ? "bg-bg-hover text-text-primary shadow-[0_0_0_1px_var(--color-border)_inset]"
                  : "text-text-secondary hover:bg-bg-hover/60 hover:text-text-primary"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("h-4 w-4", isActive ? "text-accent" : "text-text-tertiary")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-3">
        <div className="rounded-xl border border-border bg-gradient-to-br from-accent-soft to-transparent p-4">
          <p className="text-[13px] font-semibold text-text-primary">Upgrade to Pro</p>
          <p className="mt-1 text-[12px] leading-relaxed text-text-secondary">
            Unlock 4K exports, unlimited renders, and priority AI processing.
          </p>
          <button className="mt-3 w-full rounded-lg bg-text-primary py-2 text-[12.5px] font-semibold text-bg transition-opacity hover:opacity-90">
            Upgrade
          </button>
        </div>
        <button className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-text-secondary transition-colors hover:bg-bg-hover/60 hover:text-text-primary">
          <Settings className="h-4 w-4 text-text-tertiary" />
          Settings
        </button>
      </div>
    </aside>
  );
}
