/**
 * Composant ThemePanel
 *
 * Affiche le panneau latéral de sélection des thèmes et groupes de thèmes.
 *
 * Props :
 * - isOpen : booléen, ouverture/fermeture du panneau
 * - onClose : callback fermeture
 * - themeGroups : liste des groupes de thèmes
 * - onToggleTheme : callback toggle d’un sous-thème
 * - onToggleGroup : callback toggle d’un groupe
 */
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
