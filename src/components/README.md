# Dossier `src/components/` — Composants UI React (Road Stories)

Ce dossier regroupe tous les composants d’interface utilisateur (UI) React utilisés dans l’application Road Stories. Chaque composant est réutilisable, typé, et découplé de la logique métier (qui réside dans les hooks/services).

## Rôle du dossier

- **Centraliser les composants UI** (boutons, panneaux, indicateurs, sélecteurs, etc.)
- **Favoriser la réutilisation et la cohérence visuelle** dans toute l’application
- **Séparer la présentation de la logique métier** (aucune logique métier directe dans les composants)

## Structure

- `ToggleButton.tsx` : Bouton ON/OFF principal (activation de l’écoute IA)
- `StatusIndicator.tsx` : Indicateur d’état de l’application (idle, actif, speaking)
- `ThemeSelector.tsx` : Sélecteur de thèmes culturels (checkboxes)
- `ThemePanel.tsx` : Panneau latéral de gestion des thèmes
- `HistoryPanel.tsx` : Panneau d’historique des messages entendus
- `SettingsPanel.tsx` : Panneau de réglages utilisateur
- `BottomSheet.tsx` : Composant feuille/bas d’écran (mobile)
- `ToolBadges.tsx` : Badges d’outils utilisés (Wikipedia, Google Places, etc.)

## Bonnes pratiques

- **Aucune logique métier dans les composants** (tout passe par les hooks/services)
- **Typage strict TypeScript/React**
- **Props explicites et documentées**
- **Composants purs et testables**
- **Utilisation systématique de Tailwind CSS pour le style**

---

**Ce dossier est réservé aux composants UI React purs, sans logique métier directe.**
