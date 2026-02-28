import * as productModel from '../models/product.model.js';
import * as userModel from '../models/user.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as productCommentModel from '../models/productComment.model.js';
import { sendMail } from '../utils/mailer.js';
import * as templates from '../utils/emailTemplates.js';

// ==========================================
// COMMENT SECTION
// ==========================================

// 1. Định nghĩa các kịch bản gửi email (Strategy Pattern)
const mailStrategies = {
  SELLER_REPLY: async ({ productId, product, seller, content, productUrl }) => {
    // Lấy danh sách người liên quan
    const bidders = await biddingHistoryModel.getUniqueBidders(productId);
    const commenters = await productCommentModel.getUniqueCommenters(productId);

    // Gộp và loại bỏ trùng lặp (dùng Map), loại trừ seller
    const recipientMap = new Map();
    [...bidders, ...commenters].forEach(user => {
      if (user.id !== product.seller_id && user.email) {
        recipientMap.set(user.id, { email: user.email, fullname: user.fullname });
      }
    });

    // Gửi mail cho từng người
    const emailPromises = Array.from(recipientMap.values()).map(recipient => 
      sendMail({
        to: recipient.email,
        subject: `Seller answered a question on: ${product.name}`,
        html: templates.sellerResponseTemplate(recipient.fullname, product.name, seller.fullname, content, productUrl)
      }).catch(err => console.error(`Failed to send mail to ${recipient.email}:`, err))
    );

    await Promise.all(emailPromises);
    console.log(`[Mail Service] Seller reply sent to ${recipientMap.size} users.`);
  },

  NEW_REPLY: async ({ product, seller, commenter, content, productUrl }) => {
    if (!seller.email) return;
    await sendMail({
      to: seller.email,
      subject: `New reply on your product: ${product.name}`,
      html: templates.newReplyTemplate(product.name, commenter.fullname, content, productUrl)
    });
    console.log(`[Mail Service] New reply notification sent to seller.`);
  },

  NEW_QUESTION: async ({ product, seller, commenter, content, productUrl }) => {
    if (!seller.email) return;
    await sendMail({
      to: seller.email,
      subject: `New question about your product: ${product.name}`,
      html: templates.newQuestionTemplate(product.name, commenter.fullname, content, productUrl)
    });
    console.log(`[Mail Service] New question notification sent to seller.`);
  }
};

// 2. Logic điều phối (Giúp loại bỏ if-else lồng nhau)
const getCommentEventType = (isSeller, hasParentId) => {
  if (isSeller && hasParentId) return 'SELLER_REPLY';
  if (!isSeller && hasParentId) return 'NEW_REPLY';
  if (!isSeller && !hasParentId) return 'NEW_QUESTION';
  return null; 
};

// 3. Hàm Main (Controller sẽ gọi hàm này)
export const notifyNewComment = async (productId, userId, content, parentId, productUrl) => {
  try {
    const product = await productModel.findByProductId2(productId, null); // Theo DB của bạn
    if (!product) return;

    const [commenter, seller] = await Promise.all([
      userModel.findById(userId),
      userModel.findById(product.seller_id)
    ]);

    const isSeller = userId === product.seller_id;
    const eventType = getCommentEventType(isSeller, !!parentId);

    if (eventType && mailStrategies[eventType]) {
      await mailStrategies[eventType]({
        productId,
        product,
        seller,
        commenter,
        content,
        productUrl
      });
    }
  } catch (error) {
    console.error('[Mail Service] Error in notifyNewComment:', error);
  }
};

// ==========================================
// AUCTION END SECTION
// ==========================================

export const processAuctionEndedMail = async (auction, baseUrl) => {
  const productUrl = `${baseUrl}/products/detail?id=${auction.id}`;
  const newAuctionUrl = `${baseUrl}/seller/add`;
  
  const emailTasks = [];

  if (auction.highest_bidder_id) {
    // 1. Gửi cho người thắng
    if (auction.winner_email) {
      emailTasks.push(
        sendMail({
          to: auction.winner_email,
          subject: `🎉 Congratulations! You won the auction: ${auction.name}`,
          html: templates.auctionWinnerTemplate(auction.winner_name, auction.name, auction.current_price, productUrl)
        }).then(() => console.log(`✅ Winner notification sent to ${auction.winner_email} for product #${auction.id}`))
      );
    }

    // 2. Gửi cho người bán (Báo thành công)
    if (auction.seller_email) {
      emailTasks.push(
        sendMail({
          to: auction.seller_email,
          subject: `🔔 Auction Ended: ${auction.name} - Winner Found!`,
          html: templates.auctionSellerSuccessTemplate(auction.seller_name, auction.name, auction.winner_name, auction.current_price, productUrl)
        }).then(() => console.log(`✅ Seller notification sent to ${auction.seller_email} for product #${auction.id}`))
      );
    }
  } else {
    // 3. Gửi cho người bán (Báo thất bại - Không có ai bid)
    if (auction.seller_email) {
      emailTasks.push(
        sendMail({
          to: auction.seller_email,
          subject: `⏰ Auction Ended: ${auction.name} - No Bidder`,
          html: templates.auctionSellerNoBidsTemplate(auction.seller_name, auction.name, newAuctionUrl)
        }).then(() => console.log(`✅ Seller notification (no bidders) sent to ${auction.seller_email} for product #${auction.id}`))
      );
    }
  }

  await Promise.all(emailTasks);
};