
import fs from 'fs/promises';
import path from 'path';

const cacheFilePath = path.join(process.cwd(), '.cache.json');

interface Cache {
  [key: string]: unknown;
}

let memoryCache: Cache | null = null;

async function readCache(): Promise<Cache> {
  if (memoryCache) {
    return memoryCache;
  }
  try {
    const data = await fs.readFile(cacheFilePath, 'utf-8');
    memoryCache = JSON.parse(data);
    return memoryCache as Cache;
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return {}; // Return empty object if file doesn't exist
    }
    throw error;
  }
}

async function writeCache(cache: Cache): Promise<void> {
  await fs.writeFile(cacheFilePath, JSON.stringify(cache, null, 2));
  memoryCache = cache;
}

export const fileCache = {
  async get<T = unknown>(key: string, type?: 'json'): Promise<T | null> {
    const cache = await readCache();
    const value = cache[key] ?? null;
    if (type === 'json' && typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch (e) {
        // Ignore if not valid JSON
        return value as T;
      }
    }
    return value as T | null;
  },

  async put(key: string, value: any, options?: { expirationTtl?: number }): Promise<void> {
    const cache = await readCache();
    // In a real KV store, the value would be a string.
    // The AuthManager stringifies it, so we store it as is.
    cache[key] = value;
    await writeCache(cache);
    if (options?.expirationTtl) {
      // console.log(`File cache does not support TTL. Key '${key}' will not expire.`);
    }
  },

  async delete(key: string): Promise<void> {
    const cache = await readCache();
    delete cache[key];
    await writeCache(cache);
  },
};
