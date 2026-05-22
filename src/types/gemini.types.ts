export interface GeminiResult {
  message: string;
  toolsUsed: string[];
}

export interface GenerateMessageParams {
  poiName: string;
  coords: { lat: number; lng: number };
  poiTags: Record<string, string>;
}
