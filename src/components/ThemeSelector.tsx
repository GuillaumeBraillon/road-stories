import { useState } from "react";
import type { ThemeGroup } from "../types";

interface ThemeSelectorProps {
  themeGroups: ThemeGroup[];
  onToggleTheme: (id: string) => void;
  onToggleGroup: (groupId: string) => void;
}

export function ThemeSelector({ themeGroups, onToggleTheme, onToggleGroup }: ThemeSelectorProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(themeGroups.filter((g) => g.subThemes.some((t) => t.enabled)).map((g) => g.id)));

  function toggleExpand(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-2 w-full">
      {themeGroups.map((group) => {
        const enabledCount = group.subThemes.filter((t) => t.enabled).length;
        const allEnabled = enabledCount === group.subThemes.length;
        const someEnabled = enabledCount > 0 && !allEnabled;
        const isExpanded = expandedGroups.has(group.id);

        return (
          <li key={group.id} className="bg-gray-800 rounded-lg overflow-hidden">
            {/* En-tête du groupe */}
            <div className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={allEnabled}
                ref={(el) => {
                  if (el) el.indeterminate = someEnabled;
                }}
                onChange={() => onToggleGroup(group.id)}
                className="w-4 h-4 accent-green-500 shrink-0"
              />
              <button type="button" onClick={() => toggleExpand(group.id)} className="flex items-center gap-2 flex-1 text-left">
                <span>{group.icon}</span>
                <span className="text-sm font-medium text-gray-100">{group.label}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {enabledCount}/{group.subThemes.length}
                </span>
                <span className="text-gray-400 text-xs">{isExpanded ? "▲" : "▼"}</span>
              </button>
            </div>

            {/* Sous-thèmes */}
            {isExpanded && (
              <ul className="border-t border-gray-700 px-4 py-2 flex flex-col gap-2">
                {group.subThemes.map((theme) => (
                  <li key={theme.id}>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={theme.enabled} onChange={() => onToggleTheme(theme.id)} className="w-4 h-4 accent-green-500" />
                      <span className="text-sm text-gray-300">{theme.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
