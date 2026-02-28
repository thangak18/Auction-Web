import express from 'express';
import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as userModel from '../models/user.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as systemSettingModel from '../models/systemSetting.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import { sendMail } from '../utils/mailer.js';
import db from '../utils/db.js';

const router = express.Router();

// ROUTE: BIDDING HISTORY PAGE (Requires Authentication)
router.get('/', isAuthenticated, async (req, res) => {
  const productId = req.query.id;
  
  if (!productId) {
    return res.redirect('/');
  }

  try {
    // Get product information
    const product = await productModel.findByProductId2(productId, null);
    
    if (!product) {
      return res.status(404).render('404', { message: 'Product not found' });
    }

    // Load bidding history
    const biddingHistory = await biddingHistoryModel.getBiddingHistory(productId);
    
    res.render('vwProduct/biddingHistory', { 
      product,
      biddingHistory
    });
  } catch (error) {
    console.error('Error loading bidding history:', error);
    res.status(500).render('500', { message: 'Unable to load bidding history' });
  }
});

// ROUTE 3: ĐẶT GIÁ (POST) - Server-side rendering with automatic bidding
router.post('/', isAuthenticated, async (req, res) => {
  const userId = req.session.authUser.id;
  const productId = parseInt(req.body.productId);
  const bidAmount = parseFloat(req.body.bidAmount.replace(/,/g, '')); // Remove commas from input

  try {
    // Use transaction with row-level locking to prevent race conditions
    const result = await db.transaction(async (trx) => {
      // 1. Lock the product row for update to prevent concurrent modifications
      const product = await trx('products')
        .where('id', productId)
        .forUpdate() // This creates a row-level lock
        .first();
      
      if (!product) {
        throw new Error('Product not found');
      }

      // Store previous highest bidder info for email notification
      const previousHighestBidderId = product.highest_bidder_id;
      const previousPrice = parseFloat(product.current_price || product.starting_price);

      // 2. Check if product is already sold
      if (product.is_sold === true) {
        throw new Error('This product has already been sold');
      }

      // 3. Check if seller cannot bid on their own product
      if (product.seller_id === userId) {
        throw new Error('You cannot bid on your own product');
      }

      // 4. Check if bidder has been rejected
      const isRejected = await trx('rejected_bidders')
        .where('product_id', productId)
        .where('bidder_id', userId)
        .first();
      
      if (isRejected) {
        throw new Error('You have been rejected from bidding on this product by the seller');
      }

      // 5. Check rating point
      const ratingPoint = await reviewModel.calculateRatingPoint(userId);
      const userReviews = await reviewModel.getReviewsByUserId(userId);
      const hasReviews = userReviews.length > 0;
      
      if (!hasReviews) {
        // User has no reviews yet (unrated)
        if (!product.allow_unrated_bidder) {
          throw new Error('This seller does not allow unrated bidders to bid on this product.');
        }
      } else if (ratingPoint.rating_point < 0) {
        throw new Error('You are not eligible to place bids due to your rating.');
      } else if (ratingPoint.rating_point === 0) {
        throw new Error('You are not eligible to place bids due to your rating.');
      } else if (ratingPoint.rating_point <= 0.8) {
        throw new Error('Your rating point is not greater than 80%. You cannot place bids.');
      }

      // 6. Check if auction has ended
      const now = new Date();
      const endDate = new Date(product.end_at);
      if (now > endDate) {
        throw new Error('Auction has ended');
      }

      // 7. Validate bid amount against current price
      const currentPrice = parseFloat(product.current_price || product.starting_price);
      
      // bidAmount đã được validate ở frontend là phải > currentPrice
      // Nhưng vẫn kiểm tra lại để đảm bảo
      if (bidAmount <= currentPrice) {
        throw new Error(`Bid must be higher than current price (${currentPrice.toLocaleString()} VND)`);
      }

      // 8. Check minimum bid increment
      const minIncrement = parseFloat(product.step_price);
      if (bidAmount < currentPrice + minIncrement) {
        throw new Error(`Bid must be at least ${minIncrement.toLocaleString()} VND higher than current price`);
      }

      // 9. Check and apply auto-extend if needed
      let extendedEndTime = null;
      if (product.auto_extend) {
        // Get system settings for auto-extend configuration
        const settings = await systemSettingModel.getSettings();
        const triggerMinutes = settings?.auto_extend_trigger_minutes;
        const extendMinutes = settings?.auto_extend_duration_minutes;
        
        // Calculate time remaining until auction ends
        const endTime = new Date(product.end_at);
        const minutesRemaining = (endTime - now) / (1000 * 60);
        
        // If within trigger window, extend the auction
        if (minutesRemaining <= triggerMinutes) {
          extendedEndTime = new Date(endTime.getTime() + extendMinutes * 60 * 1000);
          
          // Update end_at in the product object for subsequent checks
          product.end_at = extendedEndTime;
        }
      }

      // ========== AUTOMATIC BIDDING LOGIC ==========
      
      let newCurrentPrice;
      let newHighestBidderId;
      let newHighestMaxPrice;
      let shouldCreateHistory = true; // Flag to determine if we should create bidding history

      // Special handling for buy_now_price: First-come-first-served
      // If current highest bidder already has max >= buy_now, and a NEW bidder comes in, 
      // the existing bidder wins at buy_now price immediately
      const buyNowPrice = product.buy_now_price ? parseFloat(product.buy_now_price) : null;
      let buyNowTriggered = false;
      
      if (buyNowPrice && product.highest_bidder_id && product.highest_max_price && product.highest_bidder_id !== userId) {
        const currentHighestMaxPrice = parseFloat(product.highest_max_price);
        
        // If current highest bidder already bid >= buy_now, they win immediately (when new bidder comes)
        if (currentHighestMaxPrice >= buyNowPrice) {
          newCurrentPrice = buyNowPrice;
          newHighestBidderId = product.highest_bidder_id;
          newHighestMaxPrice = currentHighestMaxPrice;
          buyNowTriggered = true;
          // New bidder's auto-bid will be recorded, but they don't win
        }
      }

      // Only run normal auto-bidding if buy_now not triggered by existing bidder
      if (!buyNowTriggered) {
        // Case 0: Người đặt giá chính là người đang giữ giá cao nhất
        if (product.highest_bidder_id === userId) {
          // Chỉ update max_price trong auto_bidding, không thay đổi current_price
          // Không tạo bidding_history mới vì giá không thay đổi
          newCurrentPrice = parseFloat(product.current_price || product.starting_price);
          newHighestBidderId = userId;
          newHighestMaxPrice = bidAmount; // Update max price
          shouldCreateHistory = false; // Không tạo history mới
        }
        // Case 1: Chưa có người đấu giá nào (first bid)
        else if (!product.highest_bidder_id || !product.highest_max_price) {
          newCurrentPrice = product.starting_price; // Only 1 bidder, no competition, set to starting price
          newHighestBidderId = userId;
          newHighestMaxPrice = bidAmount;
        } 
        // Case 2: Đã có người đấu giá trước đó
        else {
          const currentHighestMaxPrice = parseFloat(product.highest_max_price);
          const currentHighestBidderId = product.highest_bidder_id;

          // Case 2a: bidAmount < giá tối đa của người cũ
          if (bidAmount < currentHighestMaxPrice) {
            // Người cũ thắng, giá hiện tại = bidAmount của người mới
            newCurrentPrice = bidAmount;
            newHighestBidderId = currentHighestBidderId;
            newHighestMaxPrice = currentHighestMaxPrice; // Giữ nguyên max price của người cũ
          }
          // Case 2b: bidAmount == giá tối đa của người cũ
          else if (bidAmount === currentHighestMaxPrice) {
            // Người cũ thắng theo nguyên tắc first-come-first-served
            newCurrentPrice = bidAmount;
            newHighestBidderId = currentHighestBidderId;
            newHighestMaxPrice = currentHighestMaxPrice;
          }
          // Case 2c: bidAmount > giá tối đa của người cũ
          else {
            // Người mới thắng, giá hiện tại = giá max của người cũ + step_price
            newCurrentPrice = currentHighestMaxPrice + minIncrement;
            newHighestBidderId = userId;
            newHighestMaxPrice = bidAmount;
          }
        }

        // 7. Check if buy now price is reached after auto-bidding
        if (buyNowPrice && newCurrentPrice >= buyNowPrice) {
          // Nếu đạt giá mua ngay, set giá = buy_now_price
          newCurrentPrice = buyNowPrice;
          buyNowTriggered = true;
        }
      }

      let productSold = buyNowTriggered;

      // 8. Update product with new price, highest bidder, and highest max price
      const updateData = {
        current_price: newCurrentPrice,
        highest_bidder_id: newHighestBidderId,
        highest_max_price: newHighestMaxPrice
      };

      // If buy now price is reached, close auction immediately - takes priority over auto-extend
      if (productSold) {
        updateData.end_at = new Date(); // Kết thúc auction ngay lập tức
        updateData.closed_at = new Date();
        // is_sold remains NULL → Product goes to PENDING status (waiting for payment)
      }
      // If auto-extend was triggered and product NOT sold, update end_at
      else if (extendedEndTime) {
        updateData.end_at = extendedEndTime;
      }

      await trx('products')
        .where('id', productId)
        .update(updateData);

      // 9. Add bidding history record only if price changed
      // Record ghi lại người đang nắm giá sau khi tính toán automatic bidding
      if (shouldCreateHistory) {
        await trx('bidding_history').insert({
          product_id: productId,
          bidder_id: newHighestBidderId,
          current_price: newCurrentPrice
        });
      }

      // 10. Update auto_bidding table for the bidder
      // Sử dụng raw query để upsert (insert or update)
      await trx.raw(`
        INSERT INTO auto_bidding (product_id, bidder_id, max_price)
        VALUES (?, ?, ?)
        ON CONFLICT (product_id, bidder_id)
        DO UPDATE SET 
          max_price = EXCLUDED.max_price,
          created_at = NOW()
      `, [productId, userId, bidAmount]);

      return { 
        newCurrentPrice, 
        newHighestBidderId, 
        userId, 
        bidAmount,
        productSold,
        autoExtended: !!extendedEndTime,
        newEndTime: extendedEndTime,
        productName: product.name,
        sellerId: product.seller_id,
        previousHighestBidderId,
        previousPrice,
        priceChanged: previousPrice !== newCurrentPrice
      };
    });

    // ========== SEND EMAIL NOTIFICATIONS (outside transaction) ==========
    // IMPORTANT: Run email sending asynchronously to avoid blocking the response
    // This significantly improves perceived performance for the user
    const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;
    
    // Fire and forget - don't await email sending
    (async () => {
      try {
        // Get user info for emails
        const [seller, currentBidder, previousBidder] = await Promise.all([
          userModel.findById(result.sellerId),
          userModel.findById(result.userId),
          result.previousHighestBidderId && result.previousHighestBidderId !== result.userId 
            ? userModel.findById(result.previousHighestBidderId) 
            : null
        ]);

        // Send all emails in parallel instead of sequentially
        const emailPromises = [];

        // 1. Email to SELLER - New bid notification
        if (seller && seller.email) {
          emailPromises.push(sendMail({
          to: seller.email,
          subject: `💰 New bid on your product: ${result.productName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">New Bid Received!</h1>
              </div>
              <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Dear <strong>${seller.fullname}</strong>,</p>
                <p>Great news! Your product has received a new bid:</p>
                <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #72AEC8;">
                  <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                  <p style="margin: 5px 0;"><strong>Bidder:</strong> ${currentBidder ? currentBidder.fullname : 'Anonymous'}</p>
                  <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
                  <p style="font-size: 28px; color: #72AEC8; margin: 5px 0; font-weight: bold;">
                    ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                  </p>
                  ${result.previousPrice !== result.newCurrentPrice ? `
                  <p style="margin: 5px 0; color: #666; font-size: 14px;">
                    <i>Previous: ${new Intl.NumberFormat('en-US').format(result.previousPrice)} VND</i>
                  </p>
                  ` : ''}
                </div>
                ${result.productSold ? `
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; color: #155724;"><strong>🎉 Buy Now price reached!</strong> Auction has ended.</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    View Product
                  </a>
                </div>
              </div>
              <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
            </div>
          `
          }));
        }

        // 2. Email to CURRENT BIDDER - Bid confirmation
        if (currentBidder && currentBidder.email) {
          const isWinning = result.newHighestBidderId === result.userId;
          emailPromises.push(sendMail({
          to: currentBidder.email,
          subject: isWinning 
            ? `✅ You're winning: ${result.productName}` 
            : `📊 Bid placed: ${result.productName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, ${isWinning ? '#28a745' : '#ffc107'} 0%, ${isWinning ? '#218838' : '#e0a800'} 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">${isWinning ? "You're Winning!" : "Bid Placed"}</h1>
              </div>
              <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Dear <strong>${currentBidder.fullname}</strong>,</p>
                <p>${isWinning 
                  ? 'Congratulations! Your bid has been placed and you are currently the highest bidder!' 
                  : 'Your bid has been placed. However, another bidder has a higher maximum bid.'}</p>
                <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${isWinning ? '#28a745' : '#ffc107'};">
                  <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                  <p style="margin: 5px 0;"><strong>Your Max Bid:</strong> ${new Intl.NumberFormat('en-US').format(result.bidAmount)} VND</p>
                  <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
                  <p style="font-size: 28px; color: ${isWinning ? '#28a745' : '#ffc107'}; margin: 5px 0; font-weight: bold;">
                    ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                  </p>
                </div>
                ${result.productSold && isWinning ? `
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; color: #155724;"><strong>🎉 Congratulations! You won this product!</strong></p>
                  <p style="margin: 10px 0 0 0; color: #155724;">Please proceed to complete your payment.</p>
                </div>
                ` : ''}
                ${!isWinning ? `
                <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; color: #856404;"><strong>💡 Tip:</strong> Consider increasing your maximum bid to improve your chances of winning.</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                    ${result.productSold && isWinning ? 'Complete Payment' : 'View Auction'}
                  </a>
                </div>
              </div>
              <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
            </div>
          `
          }));
        }

        // 3. Email to PREVIOUS HIGHEST BIDDER - Price update notification
        // Send whenever price changes and there was a previous bidder (not the current bidder)
        if (previousBidder && previousBidder.email && result.priceChanged) {
          const wasOutbid = result.newHighestBidderId !== result.previousHighestBidderId;
          
          emailPromises.push(sendMail({
          to: previousBidder.email,
          subject: wasOutbid 
            ? `⚠️ You've been outbid: ${result.productName}`
            : `📊 Price updated: ${result.productName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, ${wasOutbid ? '#dc3545' : '#ffc107'} 0%, ${wasOutbid ? '#c82333' : '#e0a800'} 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="color: white; margin: 0;">${wasOutbid ? "You've Been Outbid!" : "Price Updated"}</h1>
              </div>
              <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                <p>Dear <strong>${previousBidder.fullname}</strong>,</p>
                ${wasOutbid 
                  ? `<p>Unfortunately, another bidder has placed a higher bid on the product you were winning:</p>`
                  : `<p>Good news! You're still the highest bidder, but the current price has been updated due to a new bid:</p>`
                }
                <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${wasOutbid ? '#dc3545' : '#ffc107'};">
                  <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                  ${!wasOutbid ? `
                  <p style="margin: 5px 0; color: #28a745;"><strong>✓ You're still winning!</strong></p>
                  ` : ''}
                  <p style="margin: 5px 0;"><strong>New Current Price:</strong></p>
                  <p style="font-size: 28px; color: ${wasOutbid ? '#dc3545' : '#ffc107'}; margin: 5px 0; font-weight: bold;">
                    ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                  </p>
                  <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">
                    <i>Previous price: ${new Intl.NumberFormat('en-US').format(result.previousPrice)} VND</i>
                  </p>
                </div>
                ${wasOutbid ? `
                <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; color: #856404;"><strong>💡 Don't miss out!</strong> Place a new bid to regain the lead.</p>
                </div>
                ` : `
                <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <p style="margin: 0; color: #155724;"><strong>💡 Tip:</strong> Your automatic bidding is working! Consider increasing your max bid if you want more protection.</p>
                </div>
                `}
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, ${wasOutbid ? '#28a745' : '#72AEC8'} 0%, ${wasOutbid ? '#218838' : '#5a9ab8'} 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    ${wasOutbid ? 'Place New Bid' : 'View Auction'}
                  </a>
                </div>
              </div>
              <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
            </div>
          `
          }));
        }

        // Send all emails in parallel
        if (emailPromises.length > 0) {
          await Promise.all(emailPromises);
          console.log(`${emailPromises.length} bid notification email(s) sent for product #${productId}`);
        }
      } catch (emailError) {
        console.error('Failed to send bid notification emails:', emailError);
        // Don't fail - emails are sent asynchronously
      }
    })(); // Execute async function immediately but don't wait for it

    // Success message
    let baseMessage = '';
    if (result.productSold) {
      // Sản phẩm đã đạt giá buy now và chuyển sang PENDING (chờ thanh toán)
      if (result.newHighestBidderId === result.userId) {
        // Người đặt giá này thắng và trigger buy now
        baseMessage = `Congratulations! You won the product with Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Please proceed to payment.`;
      } else {
        // Người đặt giá này KHÔNG thắng nhưng đã trigger buy now cho người khác
        baseMessage = `Product has been sold to another bidder at Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Your bid helped reach the Buy Now threshold.`;
      }
    } else if (result.newHighestBidderId === result.userId) {
      baseMessage = `Bid placed successfully! Current price: ${result.newCurrentPrice.toLocaleString()} VND (Your max: ${result.bidAmount.toLocaleString()} VND)`;
    } else {
      baseMessage = `Bid placed! Another bidder is currently winning at ${result.newCurrentPrice.toLocaleString()} VND`;
    }
    
    // Add auto-extend notification if applicable
    if (result.autoExtended) {
      const extendedTimeStr = new Date(result.newEndTime).toLocaleString('vi-VN');
      baseMessage += ` | Auction extended to ${extendedTimeStr}`;
    }
    
    req.session.success_message = baseMessage;
    res.redirect(`/products/detail?id=${productId}`);

  } catch (error) {
    console.error('Bid error:', error);
    req.session.error_message = error.message || 'An error occurred while placing bid. Please try again.';
    res.redirect(`/products/detail?id=${productId}`);
  }
});

// ROUTE: REJECT BIDDER (POST) - Seller rejects a bidder from a product
router.post('/reject-bidder', isAuthenticated, async (req, res) => {
  const { productId, bidderId } = req.body;
  const sellerId = req.session.authUser.id;

  try {
    let rejectedBidderInfo = null;
    let productInfo = null;
    let sellerInfo = null;

    // Use transaction to ensure data consistency
    await db.transaction(async (trx) => {
      // 1. Lock and verify product ownership
      const product = await trx('products')
        .where('id', productId)
        .forUpdate()
        .first();

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.seller_id !== sellerId) {
        throw new Error('Only the seller can reject bidders');
      }

      // Check product status - only allow rejection for ACTIVE products
      const now = new Date();
      const endDate = new Date(product.end_at);
      
      if (product.is_sold !== null || endDate <= now || product.closed_at) {
        throw new Error('Can only reject bidders for active auctions');
      }

      // 2. Check if bidder has actually bid on this product
      const autoBid = await trx('auto_bidding')
        .where('product_id', productId)
        .where('bidder_id', bidderId)
        .first();

      if (!autoBid) {
        throw new Error('This bidder has not placed a bid on this product');
      }

      // Get bidder info for email notification
      rejectedBidderInfo = await trx('users')
        .where('id', bidderId)
        .first();
      
      productInfo = product;
      sellerInfo = await trx('users')
        .where('id', sellerId)
        .first();

      // 3. Add to rejected_bidders table
      await trx('rejected_bidders').insert({
        product_id: productId,
        bidder_id: bidderId,
        seller_id: sellerId
      }).onConflict(['product_id', 'bidder_id']).ignore();

      // 4. Remove all bidding history of this bidder for this product
      await trx('bidding_history')
        .where('product_id', productId)
        .where('bidder_id', bidderId)
        .del();

      // 5. Remove from auto_bidding
      await trx('auto_bidding')
        .where('product_id', productId)
        .where('bidder_id', bidderId)
        .del();

      // 6. Recalculate highest bidder and current price
      // Always check remaining bidders after rejection
      const allAutoBids = await trx('auto_bidding')
        .where('product_id', productId)
        .orderBy('max_price', 'desc');

      const bidderIdNum = parseInt(bidderId);
      const highestBidderIdNum = parseInt(product.highest_bidder_id);
      const wasHighestBidder = (highestBidderIdNum === bidderIdNum);

      if (allAutoBids.length === 0) {
        // No more bidders - reset to starting state
        await trx('products')
          .where('id', productId)
          .update({
            highest_bidder_id: null,
            current_price: product.starting_price,
            highest_max_price: null
          });
        // Don't add bidding history - no one actually bid
      } else if (allAutoBids.length === 1) {
        // Only one bidder left - they win at starting price (no competition)
        const winner = allAutoBids[0];
        const newPrice = product.starting_price;

        await trx('products')
          .where('id', productId)
          .update({
            highest_bidder_id: winner.bidder_id,
            current_price: newPrice,
            highest_max_price: winner.max_price
          });

        // Add history entry only if price changed
        if (wasHighestBidder || product.current_price !== newPrice) {
          await trx('bidding_history').insert({
            product_id: productId,
            bidder_id: winner.bidder_id,
            current_price: newPrice
          });
        }
      } else if (wasHighestBidder) {
        // Multiple bidders and rejected was highest - recalculate price
        const firstBidder = allAutoBids[0];
        const secondBidder = allAutoBids[1];
        
        // Current price should be minimum to beat second highest
        let newPrice = secondBidder.max_price + product.step_price;
        
        // But cannot exceed first bidder's max
        if (newPrice > firstBidder.max_price) {
          newPrice = firstBidder.max_price;
        }

        await trx('products')
          .where('id', productId)
          .update({
            highest_bidder_id: firstBidder.bidder_id,
            current_price: newPrice,
            highest_max_price: firstBidder.max_price
          });

        // Add history entry only if price changed
        const lastHistory = await trx('bidding_history')
          .where('product_id', productId)
          .orderBy('created_at', 'desc')
          .first();

        if (!lastHistory || lastHistory.current_price !== newPrice) {
          await trx('bidding_history').insert({
            product_id: productId,
            bidder_id: firstBidder.bidder_id,
            current_price: newPrice
          });
        }
      }
      // If rejected bidder was NOT the highest bidder and still multiple bidders left, 
      // don't update anything - just removing them from auto_bidding is enough
    });

    // Send email notification to rejected bidder (outside transaction) - asynchronously
    if (rejectedBidderInfo && rejectedBidderInfo.email && productInfo) {
      // Don't await - send email in background
      sendMail({
        to: rejectedBidderInfo.email,
        subject: `Your bid has been rejected: ${productInfo.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">Bid Rejected</h1>
            </div>
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Dear <strong>${rejectedBidderInfo.fullname}</strong>,</p>
              <p>We regret to inform you that the seller has rejected your bid on the following product:</p>
              <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
                <h3 style="margin: 0 0 10px 0; color: #333;">${productInfo.name}</h3>
                <p style="margin: 5px 0; color: #666;"><strong>Seller:</strong> ${sellerInfo ? sellerInfo.fullname : 'N/A'}</p>
              </div>
              <p style="color: #666;">This means you can no longer place bids on this specific product. Your previous bids on this product have been removed.</p>
              <p style="color: #666;">You can still participate in other auctions on our platform.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${req.protocol}://${req.get('host')}/" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Browse Other Auctions
                </a>
              </div>
              <p style="color: #888; font-size: 13px;">If you believe this was done in error, please contact our support team.</p>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
          </div>
        `
      }).then(() => {
        console.log(`Rejection email sent to ${rejectedBidderInfo.email} for product #${productId}`);
      }).catch((emailError) => {
        console.error('Failed to send rejection email:', emailError);
      });
    }

    res.json({ success: true, message: 'Bidder rejected successfully' });
  } catch (error) {
    console.error('Error rejecting bidder:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to reject bidder' 
    });
  }
});

// ROUTE: UNREJECT BIDDER (POST) - Seller removes a bidder from rejected list
router.post('/unreject-bidder', isAuthenticated, async (req, res) => {
  const { productId, bidderId } = req.body;
  const sellerId = req.session.authUser.id;

  try {
    // Verify product ownership
    const product = await productModel.findByProductId2(productId, sellerId);
    
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.seller_id !== sellerId) {
      throw new Error('Only the seller can unreject bidders');
    }

    // Check product status - only allow unrejection for ACTIVE products
    const now = new Date();
    const endDate = new Date(product.end_at);
    
    if (product.is_sold !== null || endDate <= now || product.closed_at) {
      throw new Error('Can only unreject bidders for active auctions');
    }

    // Remove from rejected_bidders table
    await rejectedBidderModel.unrejectBidder(productId, bidderId);

    res.json({ success: true, message: 'Bidder can now bid on this product again' });
  } catch (error) {
    console.error('Error unrejecting bidder:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to unreject bidder' 
    });
  }
});

export default router;