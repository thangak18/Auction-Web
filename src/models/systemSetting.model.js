import db from '../utils/db.js';

// Lấy toàn bộ các cấu hình (chỉ trả về 1 object duy nhất)
export function getSettings() {
    return db('system_settings').where({ id: 1 }).first();
}

// Lấy 1 cấu hình cụ thể (columnName chính là tên cột, vd: 'new_product_limit_minutes')
export async function getSetting(columnName) {
    const settings = await getSettings();
    return settings ? settings[columnName] : null;
}

// Cập nhật 1 cấu hình cụ thể
export function updateSetting(columnName, value) {
    return db('system_settings')
        .where({ id: 1 })
        .update({ [columnName]: value });
}

// cập nhật 1 lúc nhiều cấu hình
export function updateMultipleSettings(data) {
    return db('system_settings')
        .where({ id: 1 })
        .update(data);
}