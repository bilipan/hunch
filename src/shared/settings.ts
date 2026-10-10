import browser from "webextension-polyfill";

export interface Settings {
  apiKey: string;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = { apiKey: "", model: "ateve-jev-v1" };

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get("settings")) as { settings?: Partial<Settings> };
  return { ...DEFAULT_SETTINGS, ...stored.settings };
}

export function saveSettings(s: Settings): Promise<void> {
  return browser.storage.local.set({ settings: s });
}

export const API_ORIGIN = { origins: ["https://tokendance.space/*"] };

export const hasApiAccess = () => browser.permissions.contains(API_ORIGIN);
export const requestApiAccess = () => browser.permissions.request(API_ORIGIN);

export interface ModelCard {
  name: string;
  description: string;
}

export async function listModels(_apiKey: string): Promise<ModelCard[]> {
  return [{ name: "ateve-jev-v1", description: "TokenDance Jev" }];
}
