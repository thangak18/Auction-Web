/**
 * Auction End Notifier
 * Script kiểm tra và gửi email thông báo khi đấu giá kết thúc
 */

import * as productModel from '../models/product.model.js';
import { processAuctionEndedMail } from '../services/mail.service.js';
import { sendMail } from '../utils/mailer.js';

/**
 * Kiểm tra các đấu giá kết thúc và gửi email thông báo
 */
export async function checkAndNotifyEndedAuctions() {
  try {
    const endedAuctions = await productModel.getNewlyEndedAuctions();
    
    if (endedAuctions.length === 0) {
      return;
    }

    console.log(`📧 Found ${endedAuctions.length} ended auctions to notify`);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3005';

    for (const auction of endedAuctions) {
      try {
        await processAuctionEndedMail(auction, baseUrl);
        
        // Đánh dấu đã gửi thông báo
        await productModel.markEndNotificationSent(auction.id);

      } catch (emailError) {
        console.error(`❌ Failed to send notification for product #${auction.id}:`, emailError);
      }
    }

  } catch (error) {
    console.error('❌ Error checking ended auctions:', error);
  }
}

/**
 * Khởi chạy job định kỳ
 * @param {number} intervalSeconds - Khoảng thời gian giữa các lần kiểm tra (giây)
 */
export function startAuctionEndNotifier(intervalSeconds = 30) {
  console.log(`🚀 Auction End Notifier started (checking every ${intervalSeconds} second(s))`);
  
  setInterval(async () => {
    try {
      const closedCount = await productModel.closeExpiredAuctions();
      if (closedCount > 0) {
        console.log(`🔒 [Auto-Close] Đã đóng ${closedCount} phiên đấu giá hết hạn.`);
      }

      await checkAndNotifyEndedAuctions();

    } catch (error) {
      console.error('❌ Lỗi trong tiến trình chạy ngầm (Background Job):', error);
    }
  }, intervalSeconds * 1000);
}
