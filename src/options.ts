import browser from "webextension-polyfill";
import { DEFAULT_SETTINGS, listModels, loadSettings, requestApiAccess, saveSettings, type Theme } from "./shared/settings";
import {
  canRebindShortcut,
  commandShortcutFromEvent,
  openShortcutsPage,
  resetShortcut,
  runningIn,
  SHORTCUTS_PAGE,
  setShortcut,
  shortcutLabel,
} from "./shared/shortcut";

const field = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const apiKey = field<HTMLInputElement>("apiKey");
const model = field<HTMLSelectElement>("model");
const theme = field<HTMLSelectElement>("theme");
const modelNote = field("modelNote");
const banner = field("nokey");
const saved = field("saved");

function showKeyBanner(hasKey: boolean) {
  banner.style.display = hasKey ? "none" : "block";
  if (!hasKey) apiKey.focus();
}

const shortcut = field<HTMLInputElement>("shortcut");
const shortcutNote = field("shortcutNote");

async function showShortcut(note = "") {
  shortcut.value = await shortcutLabel();
  shortcutNote.textContent = note;
}

async function recordShortcut(e: KeyboardEvent) {
  e.preventDefault();
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return; // wait for the real key
  const mac = (await browser.runtime.getPlatformInfo()).os === "mac";
  const combo = commandShortcutFromEvent(e, mac);
  if (!combo) return void showShortcut("Use Ctrl, Alt or Cmd together with a letter, number or function key.");
  try {
    await setShortcut(combo);
    await showShortcut("Saved");
  } catch (err) {
    await showShortcut(err instanceof Error ? err.message : "Firefox refused that shortcut.");
  }
  shortcut.blur();
}

shortcut.addEventListener("focus", () => (shortcut.value = "press keys…"));
shortcut.addEventListener("blur", () => void showShortcut(shortcutNote.textContent ?? ""));
shortcut.addEventListener("keydown", (e) => void recordShortcut(e));
field("resetShortcut").addEventListener("click", async () => {
  await resetShortcut();
  await showShortcut("Back to the default");
});

interface ModelChoice {
  name: string;
  description: string;
}

async function modelChoices(apiKey: string, selected: string): Promise<{ models: ModelChoice[]; note: string }> {
  const current = { name: selected, description: "" };
  if (!apiKey) return { models: [current], note: "Save an API key to see the models you can use." };
  try {
    const models = await listModels(apiKey);
    const selectedIsListed = models.some((m) => m.name === selected);
    return { models: selectedIsListed ? models : [current, ...models], note: "" };
  } catch (e) {
    return { models: [current], note: `Could not list models: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function loadModels(apiKey: string, selected: string) {
  const { models, note } = await modelChoices(apiKey, selected);
  model.replaceChildren(...models.map((m) => new Option(labelFor(m), m.name, false, m.name === selected)));
  modelNote.textContent = note;
}

const labelFor = (m: ModelChoice) => (m.description ? `${m.name} (${m.description})` : m.name);

async function load() {
  if (!canRebindShortcut) {
    shortcut.disabled = true;
    field("shortcutHint").hidden = true;
    field("resetShortcut").hidden = true;
    if (runningIn() === "chrome") {
      const shortcutsPageButton = document.createElement("button");
      shortcutsPageButton.type = "button";
      shortcutsPageButton.className = "link";
      shortcutsPageButton.textContent = SHORTCUTS_PAGE;
      shortcutsPageButton.addEventListener("click", () => void openShortcutsPage());
      shortcutNote.replaceChildren("Change it at ", shortcutsPageButton);
    } else {
      shortcutNote.textContent = "This browser does not let extensions change their shortcut.";
    }
  }
  shortcut.value = await shortcutLabel();
  const s = await loadSettings();
  apiKey.value = s.apiKey;
  theme.value = s.theme;
  await loadModels(s.apiKey, s.model);
  showKeyBanner(Boolean(s.apiKey));
}

async function save() {
  const s = {
    apiKey: apiKey.value.trim(),
    model: model.value || DEFAULT_SETTINGS.model,
    theme: theme.value as Theme,
  };
  await requestApiAccess();
  await saveSettings(s);
  showKeyBanner(Boolean(s.apiKey));
  await loadModels(s.apiKey, s.model);
  saved.textContent = "Saved";
  setTimeout(() => (saved.textContent = ""), 1500);
}

field("save").addEventListener("click", () => void save());
void load();
