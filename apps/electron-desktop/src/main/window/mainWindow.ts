import { BrowserWindow } from "electron";

export async function createMainWindow(params: {
  preloadPath: string;
  rendererIndex: string;
  iconPath?: string;
}): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 950,
    height: 650,
    minWidth: 950,
    minHeight: 650,
    ...(params.iconPath ? { icon: params.iconPath } : {}),

    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: params.preloadPath,
      sandbox: true,
      contextIsolation: true,
    },
  });

  await win.loadFile(params.rendererIndex);

  return win;
}
