import type { Theme } from "../types";

interface ThemeSelectorProps {
  themes: Theme[];
  onToggle: (id: string) => void;
}

export function ThemeSelector({ themes, onToggle }: ThemeSelectorProps) {
  return (
    <ul className="flex flex-col gap-2 w-full">
      {themes.map((theme) => (
        <li key={theme.id}>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input type="checkbox" checked={theme.enabled} onChange={() => onToggle(theme.id)} className="w-4 h-4 accent-green-500" />
            <span className="text-sm text-gray-200">{theme.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
