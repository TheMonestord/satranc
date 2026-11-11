import { DB_NAME, GAME_KEY, GAME_STORE } from '../../src/game/storage';

/** Testler için: doğrulamadan geçmeyen ham bir kaydı doğrudan IndexedDB'ye yazar. */
export function writeRawGame(value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(GAME_STORE);
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
