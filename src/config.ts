import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const CONFIG_PATH = join(homedir(), ".allvalue-open.json");
export const CACHE_DIR = join(homedir(), ".allvalue-open");
export function getAdminSchemaCachePath(): string {
  return join(CACHE_DIR, "admin-schema.json");
}

type AuthData = {
  accessToken: string;
  appId: number;
  clientId: string;
  clientSecret: string;
  kdtId: number;
  primaryDomain: string;
};

type Config = {
  authData?: AuthData;
};

export function loadConfig(): Config {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

function saveConfig(patch: Partial<Config>): void {
  const current = loadConfig();
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...current, ...patch }, null, 2), "utf8");
}

export function saveAuthData(data: AuthData): void {
  saveConfig({ authData: data });
}

export function getAuthToken(config: Config): string | undefined {
  return config.authData?.accessToken;
}
