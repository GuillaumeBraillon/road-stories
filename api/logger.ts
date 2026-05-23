const isDev = process.env["NODE_ENV"] === "development";
const isDebugEnabled = process.env["VITE_ENABLE_DEBUG_LOGS"] === "true";

export const logger = {
  debug: (namespace: string, ...args: unknown[]) => {
    if (isDev || isDebugEnabled) {
      console.log(`[DEBUG ${namespace}]`, ...args); // eslint-disable-line no-console
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};
