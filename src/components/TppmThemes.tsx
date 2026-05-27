// src/components/TppmThemes.tsx

interface TppmThemesProps {
  label: string | undefined;
  icon?: string;
}

export function TppmThemes({ label, icon }: TppmThemesProps) {
  if (!label) return null;

  return (
    <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 w-max shrink-0">
      {icon ? <span>{icon}</span> : <span>📍</span>}
      <span>{label}</span>
    </span>
  );
}
