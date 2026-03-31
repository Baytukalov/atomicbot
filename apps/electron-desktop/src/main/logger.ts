import log from "electron-log/main";
import { app } from "electron";
import * as path from "node:path";

type ConsoleMethod = (...data: unknown[]) => void;

let consolePatched = false;

const originalConsole: {
  log: ConsoleMethod;
  info: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
  debug: ConsoleMethod;
} = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

function mirrorToConsoleAndFile(
  original: ConsoleMethod,
  writeToFile: (...data: unknown[]) => void
): ConsoleMethod {
  return (...data: unknown[]) => {
    original(...data);
    writeToFile(...data);
  };
}

/**
 * Initializes electron-log: writes main-process logs to `{userData}/logs/main.log`
 * and mirrors global `console` output to both stdout/stderr and the log file.
 * Must be called after any `app.setPath("userData", ...)` overrides.
 */
export function initLogger(): void {
  const logsDir = path.join(app.getPath("userData"), "logs");

  log.transports.file.resolvePathFn = () => path.join(logsDir, "main.log");
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.initialize();
  log.transports.console.level = false;

  if (consolePatched) {
    return;
  }

  console.log = mirrorToConsoleAndFile(originalConsole.log, (...data) => log.log(...data));
  console.info = mirrorToConsoleAndFile(originalConsole.info, (...data) => log.info(...data));
  console.warn = mirrorToConsoleAndFile(originalConsole.warn, (...data) => log.warn(...data));
  console.error = mirrorToConsoleAndFile(originalConsole.error, (...data) => log.error(...data));
  console.debug = mirrorToConsoleAndFile(originalConsole.debug, (...data) => log.debug(...data));
  consolePatched = true;
}

export default log;
