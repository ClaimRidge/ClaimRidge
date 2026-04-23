"use client";

interface KpiTileProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  color: "navy" | "green" | "amber" | "red" | "blue";
  trend?: { value: string; positive: boolean };
}

const COLOR_MAP = {
  navy: { bg: "bg-[#0A1628]/5", border: "border-[#0A1628]/10", icon: "text-[#0A1628]" },
  green: { bg: "bg-[#f0fdf4]", border: "border-[#bbf7d0]", icon: "text-[#16a34a]" },
  amber: { bg: "bg-amber-50", border: "border-amber-200", icon: "text-amber-500" },
  red: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500" },
  blue: { bg: "bg-blue-50", border: "border-blue-200", icon: "text-blue-500" },
};

export default function KpiTile({ label, value, subtext, icon: Icon, color, trend }: KpiTileProps) {
  const c = COLOR_MAP[color];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-[#9ca3af] font-medium">{label}</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-[#0a0a0a] mt-1.5 truncate">{value}</p>
          {subtext && <p className="text-xs text-[#9ca3af] mt-1">{subtext}</p>}
          {trend && (
            <p className={`text-xs mt-1 font-medium ${trend.positive ? "text-[#16a34a]" : "text-red-500"}`}>
              {trend.value}
            </p>
          )}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${c.bg} ${c.border} border flex-shrink-0 ml-3`}>
          <Icon className={`h-5 w-5 ${c.icon}`} />
        </div>
      </div>
    </div>
  );
}
