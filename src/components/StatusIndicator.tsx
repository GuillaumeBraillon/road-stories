import type { AppStatus } from "../types";

interface StatusIndicatorProps {
  status: AppStatus;
  currentPOIName: string | null;
}

export function StatusIndicator({ status, currentPOIName }: StatusIndicatorProps) {
  if (status === "idle") {
    return <p className="text-gray-400 text-sm">En attente...</p>;
  }

  if (status === "speaking") {
    return <p className="text-green-500 text-sm font-medium animate-pulse">♪ {currentPOIName}</p>;
  }

  return <p className="text-blue-400 text-sm">En écoute 🎧</p>;
}
