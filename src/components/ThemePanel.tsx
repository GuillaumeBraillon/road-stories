import type { ThemeGroup } from "../types";
import { BottomSheet } from "./BottomSheet";
import { ThemeSelector } from "./ThemeSelector";

interface ThemePanelProps {
  isOpen: boolean;
  onClose: () => void;
  themeGroups: ThemeGroup[];
  onToggleTheme: (id: string) => void;
  onToggleGroup: (groupId: string) => void;
}

export function ThemePanel({ isOpen, onClose, themeGroups, onToggleTheme, onToggleGroup }: ThemePanelProps) {
  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Thèmes">
      <ThemeSelector themeGroups={themeGroups} onToggleTheme={onToggleTheme} onToggleGroup={onToggleGroup} />
    </BottomSheet>
  );
}
