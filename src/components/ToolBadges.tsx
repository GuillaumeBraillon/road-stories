/**
 * Composant ToolBadges
 *
 * Affiche les badges des outils IA utilisés pour générer le message (Gemini, Wikipedia, Google Places).
 *
 * Props :
 * - tools : tableau de noms d’outils utilisés (string[])
 */
interface ToolBadgesProps {
  tools: string[] | undefined;
}

export function ToolBadges({ tools }: ToolBadgesProps) {
  if (!tools || tools.length === 0) {
    return <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Gemini brut</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">Gemini</span>
      {tools.includes("getWikipediaSummary") && (
        <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">📚 Wikipedia</span>
      )}
      {tools.includes("getPlaceDetails") && (
        <span className="text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
          ✨ Google Places
        </span>
      )}
    </div>
  );
}
