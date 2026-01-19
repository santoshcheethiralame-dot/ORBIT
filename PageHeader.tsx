// PageHeader.tsx
import React from "react";

type Badge = { text: string; type?: string };

export const PageHeader = ({
  title,
  showDate = false,
  badge,
}: {
  title: string;
  showDate?: boolean;
  badge?: Badge;
}) => {
  return (
    <div className="flex justify-between items-end">
      <div>
        <div className="flex items-center gap-3 mb-2">
          {showDate && (
            <div className="text-xs font-mono text-zinc-500 uppercase tracking-[0.15em]">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
          )}

          {badge && (
            <span
              className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider ${
                badge.type === "esa"
                  ? "bg-red-500/20 text-red-300 border border-red-500/30"
                  : "bg-orange-500/20 text-orange-300 border border-orange-500/30"
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>

        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
          {title}
        </h1>
      </div>

      {/* keep right-side slot available for future header actions (preserves layout) */}
      <div aria-hidden />
    </div>
  );
};

export default PageHeader;
