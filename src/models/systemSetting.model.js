import db from '../utils/db.js';

export function getSettings() {
    return db('system_settings').where({ id: 1 }).first();
}

export async function getSetting(columnName) {
    const settings = await getSettings();
    return settings ? settings[columnName] : null;
}

export function updateMultipleSettings(data) {
    return db('system_settings')
        .where({ id: 1 })
        .update(data);
}