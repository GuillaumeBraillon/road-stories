/**
 * Composant StatusIndicator
 *
 * Affiche l’état courant de l’application (idle, recherche, lecture, etc.)
 * Affiche le nom du POI courant et le rayon de détection.
 *
 * Props :
 * - status : statut de l’app (AppStatus)
 * - currentPOIName : nom du POI courant
 * - detectionRadiusM : rayon de détection en mètres
 */
import type { AppStatus } from "../types";

interface StatusIndicatorProps {
  status: AppStatus;
  currentPOIName: string | null;
  detectionRadiusM: number;
}

export function StatusIndicator({ status, currentPOIName, detectionRadiusM }: StatusIndicatorProps) {
  if (status === "idle") {
    return <p className="text-gray-400 text-sm">En attente…</p>;
  }

  if (status === "no-poi") {
    return <p className="text-gray-400 text-sm">Aucun point d'intérêt dans un rayon de {detectionRadiusM} m</p>;
  }

  if (status === "speaking") {
    return <p className="text-green-500 text-sm font-medium animate-pulse">🔊 {currentPOIName}</p>;
  }

  if (status === "generating") {
    return <p className="text-blue-400 text-sm animate-pulse">✨ Génération en cours{currentPOIName ? ` — ${currentPOIName}` : "…"}</p>;
  }

  if (status === "searching") {
    return <p className="text-blue-400 text-sm animate-pulse">🗺 Recherche des points d'intérêt…</p>;
  }

  return <p className="text-blue-400 text-sm">📍 GPS actif — écoute des alentours</p>;
}
