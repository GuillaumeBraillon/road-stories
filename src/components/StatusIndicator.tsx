import type { AppStatus } from "../types";

interface StatusIndicatorProps {
  status: AppStatus;
  currentPOIName: string | null;
}

export function StatusIndicator({ status, currentPOIName }: StatusIndicatorProps) {
  if (status === "idle") {
    return <p className="text-gray-400 text-sm">En attente…</p>;
  }

  if (status === "no-poi") {
    return <p className="text-gray-400 text-sm">Aucun point d'intérêt à proximité</p>;
  }

  if (status === "speaking") {
    return <p className="text-green-500 text-sm font-medium animate-pulse">♪ {currentPOIName}</p>;
  }

  if (status === "generating") {
    return <p className="text-blue-400 text-sm animate-pulse">Génération du message{currentPOIName ? ` — ${currentPOIName}` : "…"}</p>;
  }

  const label = status === "searching" ? "Recherche des points d'intérêt…" : status === "wikipedia" ? "Recherche d'informations…" : "Détection des alentours…";

  return <p className="text-blue-400 text-sm">{label}</p>;
}
