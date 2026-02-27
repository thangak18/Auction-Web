import express from 'express';
import * as systemSettingModel from '../../models/systemSetting.model.js';
const router = express.Router();

/**
 * GIẢI QUYẾT DRY: 
 * Định nghĩa cấu hình mặc định ở 1 nơi duy nhất.
 * Nếu có lỗi DB, ta dùng luôn object này mà không phải copy-paste nhiều lần.
 */
const DEFAULT_SETTINGS = {
    new_product_limit_minutes: 60,
    auto_extend_trigger_minutes: 5,
    auto_extend_duration_minutes: 10
};

router.get('/settings', async (req, res) => {
    try {
        let settings = await systemSettingModel.getSettings();
        if (!settings) settings = DEFAULT_SETTINGS;
        
        res.render('vwAdmin/system/setting', {
            settings,
            success_message: req.query.success
        });
    } catch (error) {
        console.error('Error loading settings:', error);
        res.render('vwAdmin/system/setting', {
            settings: DEFAULT_SETTINGS,
            error_message: 'Failed to load system settings'
        });
    }
});

router.post('/settings', async (req, res) => {
    try {
        const updateData = {
            new_product_limit_minutes: parseInt(req.body.new_product_limit_minutes) || 60,
            auto_extend_trigger_minutes: parseInt(req.body.auto_extend_trigger_minutes) || 5,
            auto_extend_duration_minutes: parseInt(req.body.auto_extend_duration_minutes) || 10
        };
        
        await systemSettingModel.updateMultipleSettings(updateData);
        
        res.redirect('/admin/system/settings?success=Settings updated successfully');
    } catch (error) {
        console.error('Error updating settings:', error);
        let settings = await systemSettingModel.getSettings();
        if (!settings) settings = DEFAULT_SETTINGS;
        
        res.render('vwAdmin/system/setting', {
            settings,
            error_message: 'Failed to update settings. Please try again.'
        });
    }
});

export default router;
