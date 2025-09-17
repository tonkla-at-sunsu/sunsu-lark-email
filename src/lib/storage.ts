
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
