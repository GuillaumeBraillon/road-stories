import { useState } from "react";
import type { Theme } from "./types";
import { useRoadStories } from "./hooks/useRoadStories";
import { ToggleButton } from "./components/ToggleButton";
import { StatusIndicator } from "./components/StatusIndicator";
import { ThemeSelector } from "./components/ThemeSelector";

const DEFAULT_THEMES: Theme[] = [
  { id: "monuments-historiques", label: "Monuments historiques", enabled: true },
  { id: "histoire-villes", label: "Histoire des villes", enabled: true },
  { id: "curiosites-naturelles", label: "Curiosités naturelles", enabled: true },
  { id: "anecdotes", label: "Anecdotes insolites", enabled: true },
  { id: "gastronomie", label: "Gastronomie locale", enabled: true },
  { id: "personnages", label: "Personnages célèbres", enabled: true },
];

function App() {
  const [themes, setThemes] = useState<Theme[]>(DEFAULT_THEMES);

  const { isActive, setIsActive, status, currentPOIName } = useRoadStories(themes);

  function handleThemeToggle(id: string) {
    setThemes((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center px-6 py-10 gap-8">
      <h1 className="text-3xl font-bold tracking-tight">Road Stories</h1>

      <StatusIndicator status={status} currentPOIName={currentPOIName} />

      <div className="flex-1 flex items-center justify-center">
        <ToggleButton isActive={isActive} onToggle={() => setIsActive(!isActive)} disabled={false} />
      </div>

      <div className="w-full max-w-sm overflow-y-auto">
        <ThemeSelector themes={themes} onToggle={handleThemeToggle} />
      </div>
    </div>
  );
}

export default App;
