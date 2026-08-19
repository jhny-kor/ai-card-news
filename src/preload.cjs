const { contextBridge, ipcRenderer } = require("electron");

const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld("api", {
  getSettings: () => call("settings:get"),
  setSettings: (cfg) => call("settings:set", cfg),
  listTemplates: () => call("templates:list"),
  listPlatforms: () => call("platforms:list"),
  pickFiles: () => call("files:pick"),
  pickDir: () => call("dir:pick"),
  listModels: (cfg) => call("models:list", cfg),
  listImageModels: (cfg) => call("imageModels:list", cfg),
  imageConfig: (cfg) => call("imageConfig", cfg),
  preview: (card, templates, font) => call("preview", card, templates, font),
  run: (payload) => call("run", payload),
  open: (p) => call("open", p),
  onLog: (fn) => ipcRenderer.on("log", (_e, msg) => fn(msg)),
});
