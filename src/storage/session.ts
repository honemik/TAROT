import { validReading, type Reading } from '../domain/reading';

let database: Promise<IDBDatabase> | undefined;
function db() {
  return database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('arcana-table', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('資料庫被其他分頁鎖定'));
  });
}
export async function loadReading(): Promise<Reading | null> {
  const connection = await db();
  return new Promise((resolve, reject) => {
    const request = connection.transaction('sessions').objectStore('sessions').get('current');
    request.onsuccess = () => {
      if (request.result === undefined) resolve(null);
      else if (validReading(request.result)) resolve(request.result);
      else reject(new Error('上次牌桌資料格式不完整，已保留原始資料。'));
    };
    request.onerror = () => reject(request.error);
  });
}
export async function saveReading(reading: Reading) {
  const connection = await db();
  return new Promise<void>((resolve, reject) => {
    const transaction = connection.transaction('sessions', 'readwrite');
    transaction.objectStore('sessions').put(structuredClone(reading), 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
