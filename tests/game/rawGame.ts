import { DB_NAME, DB_VERSION, GAME_KEY, GAME_STORE, upgradeDb } from '../../src/game/storage';

/** Testler için: doğrulamadan geçmeyen ham bir kaydı doğrudan IndexedDB'ye yazar. */
export function writeRawGame(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => upgradeDb(open.result);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(GAME_STORE, 'readwrite');
      tx.objectStore(GAME_STORE).put(value, GAME_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
