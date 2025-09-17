
export const setItem = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error('Error setting item:', error);
    }
};

export const getItem = (key: string) => {
    if (typeof window === "undefined") {
        return null;
    }
    try {
        const value = localStorage.getItem(key);
        return value !== null ? JSON.parse(value) : "";
    } catch (error) {
        console.error("Error getting item:", error);
        return null;
    }
};

export const removeItem = async (key: string) => {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.error("Error removing item:", error);
    }
};

const IDB_DB_NAME = "sunsu-accounting";
const IDB_STORE_NAME = "cache";

const openIndexedDb = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined") {
            return reject(new Error("No window"));
        }
        const request = window.indexedDB.open(IDB_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                db.createObjectStore(IDB_STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
    });
};

export const idbGetItem = async (key: string): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
        const db = await openIndexedDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, "readonly");
            const store = tx.objectStore(IDB_STORE_NAME);
            const req = store.get(key);
            req.onsuccess = () => resolve((req.result as string) ?? null);
            req.onerror = () => reject(req.error ?? new Error("get failed"));
        });
    } catch {
        return null;
    }
};

export const idbSetItem = async (key: string, value: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
        const db = await openIndexedDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, "readwrite");
            const store = tx.objectStore(IDB_STORE_NAME);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error ?? new Error("put failed"));
        });
    } catch (e) {
        console.error("IndexedDB setItem error:", e);
    }
};

export const idbRemoveItem = async (key: string): Promise<void> => {
    if (typeof window === "undefined") return;
    try {
        const db = await openIndexedDb();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE_NAME, "readwrite");
            const store = tx.objectStore(IDB_STORE_NAME);
            const req = store.delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error ?? new Error("delete failed"));
        });
    } catch (e) {
        console.error("IndexedDB removeItem error:", e);
    }
};

export const idbCountKeysByPrefix = async (prefix: string): Promise<number> => {
    if (typeof window === "undefined") return 0;
    try {
        const db = await openIndexedDb();
        return await new Promise<number>((resolve, reject) => {
            let count = 0;
            const tx = db.transaction(IDB_STORE_NAME, "readonly");
            const store = tx.objectStore(IDB_STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result as IDBCursorWithValue | null;
                if (cursor) {
                    const key = String(cursor.key);
                    if (key.startsWith(prefix)) {
                        count += 1;
                    }
                    cursor.continue();
                } else {
                    resolve(count);
                }
            };
            request.onerror = () => reject(request.error ?? new Error("cursor failed"));
        });
    } catch (e) {
        console.error("IndexedDB count error:", e);
        return 0;
    }
};

export const idbGetValuesByPrefix = async (prefix: string): Promise<Array<{ key: string, value: string }>> => {
    if (typeof window === "undefined") return [];
    try {
        const db = await openIndexedDb();
        return await new Promise<Array<{ key: string, value: string }>>((resolve, reject) => {
            const results: Array<{ key: string, value: string }> = [];
            const tx = db.transaction(IDB_STORE_NAME, "readonly");
            const store = tx.objectStore(IDB_STORE_NAME);
            const request = store.openCursor();
            request.onsuccess = () => {
                const cursor = request.result as IDBCursorWithValue | null;
                if (cursor) {
                    const key = String(cursor.key);
                    if (key.startsWith(prefix)) {
                        results.push({ key, value: String(cursor.value) });
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject(request.error ?? new Error("cursor failed"));
        });
    } catch (e) {
        console.error("IndexedDB list error:", e);
        return [];
    }
};

// Filter management types
export type SavedFilter = {
    id: string;
    name: string;
    sender: string;
    subject: string;
    createdAt: string;
};

// Filter storage functions
export const saveFilter = async (userEmail: string, filter: Omit<SavedFilter, 'id' | 'createdAt'>): Promise<string> => {
    const id = `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const savedFilter: SavedFilter = {
        ...filter,
        id,
        createdAt: new Date().toISOString(),
    };

    const key = `saved_filter:${userEmail}:${id}`;
    await idbSetItem(key, JSON.stringify(savedFilter));
    return id;
};

export const getSavedFilters = async (userEmail: string): Promise<SavedFilter[]> => {
    const prefix = `saved_filter:${userEmail}:`;
    const entries = await idbGetValuesByPrefix(prefix);
    const filters: SavedFilter[] = [];

    for (const entry of entries) {
        try {
            const filter = JSON.parse(entry.value) as SavedFilter;
            filters.push(filter);
        } catch (e) {
            console.error("Error parsing saved filter:", e);
        }
    }

    // Sort by creation date (newest first)
    return filters.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const deleteSavedFilter = async (userEmail: string, filterId: string): Promise<void> => {
    const key = `saved_filter:${userEmail}:${filterId}`;
    await idbRemoveItem(key);
};

export const updateSavedFilter = async (userEmail: string, filterId: string, filter: Omit<SavedFilter, 'id' | 'createdAt'>): Promise<void> => {
    const key = `saved_filter:${userEmail}:${filterId}`;
    const existingFilter = await idbGetItem(key);

    if (existingFilter) {
        const parsed = JSON.parse(existingFilter) as SavedFilter;
        const updatedFilter: SavedFilter = {
            ...filter,
            id: filterId,
            createdAt: parsed.createdAt, // Keep original creation date
        };
        await idbSetItem(key, JSON.stringify(updatedFilter));
    }
};
