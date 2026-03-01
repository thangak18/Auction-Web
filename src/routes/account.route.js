import express from 'express';

// 1. Import 3 "đệ tử" đã được tách ra
import authRoute from './auth.route.js';
import profileRoute from './profile.route.js';
import activityRoute from './activity.route.js';

const router = express.Router();

// 2. Gom tất cả lại dưới một mối
// Mọi đường dẫn bắt đầu bằng /account sẽ được phân phối đi đúng chỗ
router.use('/', authRoute);     // Các route login, signup, otp...
router.use('/', profileRoute);  // Các route profile, logout, upgrade...
router.use('/', activityRoute); // Các route đấu giá, yêu thích, đánh giá...

export default router;