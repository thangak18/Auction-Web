import db from "../utils/db.js";
import * as reviewModel from '../models/review.model.js';
import * as systemSettingModel from '../models/systemSetting.model.js';

// ==========================================
// PLACE BID TRANSACTION
// ==========================================

const validateBid = ({ 
  product, userId, bidAmount, isRejected, hasReviews, ratingPoint, now 
}) => {
  // Check if product is already sold
  if (product.is_sold === true) throw new Error('This product has already been sold');
  // Check if seller cannot bid on their own product
  if (product.seller_id === userId) throw new Error('You cannot bid on your own product');
  // Check if bidder has been rejected
  if (isRejected) throw new Error('You have been rejected from bidding on this product by the seller');
  
  const endDate = new Date(product.end_at);
  if (now > endDate) throw new Error('Auction has ended');

  if (!hasReviews) {
    if (!product.allow_unrated_bidder) {
      throw new Error('This seller does not allow unrated bidders to bid on this product.');
    }
  } else if (ratingPoint.rating_point <= 0.8)  {
    throw new Error('Your rating point is not greater than 80%. You cannot place bids on this product.');
  }

  const currentPrice = parseFloat(product.current_price || product.starting_price);
  if (bidAmount <= currentPrice)
    throw new Error(`Bid must be higher than current price (${currentPrice.toLocaleString()} VND)`);

  const minIncrement = parseFloat(product.step_price);
  if (bidAmount < currentPrice + minIncrement)
    throw new Error(`Bid must be at least ${minIncrement.toLocaleString()} VND higher than current price`);
};

const calculateNewAuctionState = ({ product, bidAmount, userId, systemSettings, now }) => {
  const minIncrement = parseFloat(product.step_price);
  const buyNowPrice = product.buy_now_price ? parseFloat(product.buy_now_price) : null;
  const currentHighestMaxPrice = parseFloat(product.highest_max_price || 0);
  
  let state = {
    newCurrentPrice: null,
    newHighestBidderId: null,
    newHighestMaxPrice: null,
    shouldCreateHistory: true,
    buyNowTriggered: false,
    extendedEndTime: null
  };

  // 1. Auto Extend Logic
  if (product.auto_extend && systemSettings) {
    const endTime = new Date(product.end_at);
    const minutesRemaining = (endTime - now) / (1000 * 60);
    if (minutesRemaining <= systemSettings.auto_extend_trigger_minutes) {
      state.extendedEndTime = new Date(endTime.getTime() + systemSettings.auto_extend_duration_minutes * 60 * 1000);
    }
  }

  // 2. Buy Now Check (Existing Bidder)
  if (buyNowPrice && product.highest_bidder_id && product.highest_bidder_id !== userId) {
    if (currentHighestMaxPrice >= buyNowPrice) {
      state.newCurrentPrice = buyNowPrice;
      state.newHighestBidderId = product.highest_bidder_id;
      state.newHighestMaxPrice = currentHighestMaxPrice;
      state.buyNowTriggered = true;
      return state; // Dừng luôn nếu trigger
    }
  }

  // 3. Normal Auto-Bidding
  if (product.highest_bidder_id === userId) {
    state.newCurrentPrice = parseFloat(product.current_price || product.starting_price);
    state.newHighestBidderId = userId;
    state.newHighestMaxPrice = bidAmount;
    state.shouldCreateHistory = false;
  } else if (!product.highest_bidder_id) {
    state.newCurrentPrice = parseFloat(product.starting_price);
    state.newHighestBidderId = userId;
    state.newHighestMaxPrice = bidAmount;
  } else {
    if (bidAmount <= currentHighestMaxPrice) {
      state.newCurrentPrice = bidAmount;
      state.newHighestBidderId = product.highest_bidder_id;
      state.newHighestMaxPrice = currentHighestMaxPrice;
    } else {
      state.newCurrentPrice = currentHighestMaxPrice + minIncrement;
      state.newHighestBidderId = userId;
      state.newHighestMaxPrice = bidAmount;
    }
  }

  // 4. Final Buy Now Check
  if (buyNowPrice && state.newCurrentPrice >= buyNowPrice) {
    state.newCurrentPrice = buyNowPrice;
    state.buyNowTriggered = true;
  }

  return state;
};

export const placeBidTransaction = async (userId, productId, bidAmount) => {
  return await db.transaction(async (trx) => {
    // 1. Lock the product row for update to prevent concurrent modifications
    const product = await trx('products').where('id', productId).forUpdate().first(); // This creates a row-level lock.first()
    if (!product)throw new Error('Product not found');

    const previousHighestBidderId = product.highest_bidder_id;
    const previousPrice = parseFloat(product.current_price || product.starting_price);
    const isRejected = await trx('rejected_bidders').where('product_id', productId).where('bidder_id', userId).first();
    const ratingPoint = await reviewModel.calculateRatingPoint(userId);
    const userReviews = await reviewModel.getReviewsByUserId(userId);
    const settings = product.auto_extend ? await systemSettingModel.getSettings() : null;
    const now = new Date();

    validateBid({product, userId, bidAmount, isRejected, hasReviews: userReviews.length > 0, ratingPoint, now});

    const newState = calculateNewAuctionState({product, bidAmount, userId, systemSettings: settings, now})

    // 8. Update product with new price, highest bidder, and highest max price
    const updateData = {
      current_price: newState.newCurrentPrice,
      highest_bidder_id: newState.newHighestBidderId,
      highest_max_price: newState.newHighestMaxPrice
    };

    // If buy now price is reached, close auction immediately - takes priority over auto-extend
    if (newState.buyNowTriggered) {
      updateData.end_at = now;
      updateData.closed_at = now;
    } else if (newState.extendedEndTime) {
      updateData.end_at = newState.extendedEndTime;
    }

    await trx('products').where('id', productId).update(updateData);

    // 9. Add bidding history record only if price changed
    // Record ghi lại người đang nắm giá sau khi tính toán automatic bidding
    if (newState.shouldCreateHistory) {
      await trx('bidding_history').insert({
        product_id: productId,
        bidder_id: newState.newHighestBidderId,
        current_price: newState.newCurrentPrice
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
      productId,
      userId, 
      bidAmount,
      newCurrentPrice: newState.newCurrentPrice, 
      newHighestBidderId: newState.newHighestBidderId, 
      productSold: newState.buyNowTriggered,
      autoExtended: !!newState.extendedEndTime,
      newEndTime: newState.extendedEndTime,
      productName: product.name,
      sellerId: product.seller_id,
      previousHighestBidderId,
      previousPrice,
      priceChanged: previousPrice !== newState.newCurrentPrice
    };
  });
}