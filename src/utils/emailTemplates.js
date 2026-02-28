/**
 * ==========================================
 * BỘ EMAIL TEMPLATES CHO ONLINE AUCTION
 * Giữ nguyên 100% HTML/CSS gốc của dự án
 * ==========================================
 */

// ==========================================
// 1. BIDDING & PRODUCT ROUTE TEMPLATES
// ==========================================

// Gửi cho Seller khi có người Bid mới
export const newBidReceivedTemplate = (seller, result, currentBidder, productUrl) => `
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
`;

// Gửi cho người vừa đặt Bid (Đang thắng hoặc Bị đặt thấp hơn Max Bid)
export const bidPlacedTemplate = (currentBidder, result, isWinning, productUrl) => `
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
`;

// Gửi cho người Bid cũ (Bị vượt giá hoặc Cập nhật giá auto-bid)
export const outbidOrPriceUpdateTemplate = (previousBidder, result, wasOutbid, productUrl) => `
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
`;

// Gửi khi bị Seller từ chối Bid
export const bidRejectedTemplate = (rejectedBidderInfo, productInfo, sellerInfo, homeUrl) => `
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
      <a href="${homeUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        Browse Other Auctions
      </a>
    </div>
    <p style="color: #888; font-size: 13px;">If you believe this was done in error, please contact our support team.</p>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
</div>
`;

// ==========================================
// 2. COMMENT ROUTE TEMPLATES (PASSED)
// ==========================================

export const sellerResponseTemplate = (recipientName, productName, sellerName, content, productUrl) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #667eea;">Seller Response on Product</h2>
  <p>Dear <strong>${recipientName}</strong>,</p>
  <p>The seller has responded to a question on a product you're interested in:</p>
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
    <p><strong>Product:</strong> ${productName}</p>
    <p><strong>Seller:</strong> ${sellerName}</p>
    <p><strong>Answer:</strong></p>
    <p style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">${content}</p>
  </div>
  <div style="text-align: center; margin: 30px 0;">
    <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
      View Product
    </a>
  </div>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #888; font-size: 12px;">This is an automated message from Online Auction. Please do not reply to this email.</p>
</div>
`;

const newCommentTemplate = (isReply, productName, commenterName, content, productUrl) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #667eea;">${isReply ? "New Reply on" : "New Question About"} Your Product</h2>
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <p><strong>Product:</strong> ${productName}</p>
      <p><strong>From:</strong> ${commenterName}</p>
      <p><strong>${isReply ? "Reply:" : "Question:"}</strong></p>
      <p style="background-color: white; padding: 15px; border-radius: 5px;">${content}</p>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
        View Product & ${isReply ? "Reply" : "Answer"}
      </a>
    </div>
  </div>
`;

export const newReplyTemplate = (productName, commenterName, content, productUrl) => {
  return newCommentTemplate(true, productName, commenterName, content, productUrl);
};

export const newQuestionTemplate = (productName, commenterName, content, productUrl) => {
  return newCommentTemplate(false, productName, commenterName, content, productUrl);
}

// ==========================================
// 3. SELLER ROUTE TEMPLATES
// ==========================================

export const descriptionUpdatedTemplate = (user, product, description, productUrl) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9bb8 100%); padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">Product Description Updated</h1>
    </div>
    <div style="padding: 20px; background: #f9f9f9;">
        <p>Hello <strong>${user.fullname}</strong>,</p>
        <p>The seller has added new information to the product description:</p>
        <div style="background: white; padding: 15px; border-left: 4px solid #72AEC8; margin: 15px 0;">
            <h3 style="margin: 0 0 10px 0; color: #333;">${product.name}</h3>
            <p style="margin: 0; color: #666;">Current Price: <strong style="color: #72AEC8;">${new Intl.NumberFormat('en-US').format(product.current_price)} VND</strong></p>
        </div>
        <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 0 0 10px 0; font-weight: bold; color: #f57c00;"><i>✉</i> New Description Added:</p>
            <div style="color: #333;">${description.trim()}</div>
        </div>
        <p>View the product to see the full updated description:</p>
        <a href="${productUrl}" style="display: inline-block; background: #72AEC8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0;">View Product</a>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #999; font-size: 12px;">You received this email because you placed a bid or asked a question on this product.</p>
    </div>
</div>
`;

// ==========================================
// 4. USER & ADMIN ROUTE TEMPLATES
// ==========================================

export const adminPasswordResetTemplate = (user, defaultPassword) => `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <h2 style="color: #333;">Password Reset Notification</h2>
    <p>Dear <strong>${user.fullname}</strong>,</p>
    <p>Your account password has been reset by an administrator.</p>
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Your new temporary password:</strong></p>
        <p style="font-size: 24px; color: #e74c3c; margin: 10px 0; font-weight: bold;">${defaultPassword}</p>
    </div>
    <p style="color: #e74c3c;"><strong>Important:</strong> Please log in and change your password immediately for security purposes.</p>
    <p>If you did not request this password reset, please contact our support team immediately.</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #888; font-size: 12px;">This is an automated message from Online Auction. Please do not reply to this email.</p>
</div>
`;

// ==========================================
// 5. AUCTION END TEMPLATES
// ==========================================

export const auctionWinnerTemplate = (winnerName, productName, currentPrice, productUrl) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">🎉 You Won!</h1>
    </div>
    <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Dear <strong>${winnerName}</strong>,</p>
      <p>Congratulations! You have won the auction for:</p>
      <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${productName}</h3>
        <p style="font-size: 24px; color: #28a745; margin: 0; font-weight: bold;">
          ${new Intl.NumberFormat('en-US').format(currentPrice)} VND
        </p>
      </div>
      <p>Please complete your payment to finalize the purchase.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Complete Payment
        </a>
      </div>
      <p style="color: #666; font-size: 14px;">Please complete payment within 3 days to avoid order cancellation.</p>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
  </div>
`;

export const auctionSellerSuccessTemplate = (sellerName, productName, winnerName, currentPrice, productUrl) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">Auction Ended</h1>
    </div>
    <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Dear <strong>${sellerName}</strong>,</p>
      <p>Your auction has ended with a winner!</p>
      <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #72AEC8;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${productName}</h3>
        <p style="margin: 5px 0;"><strong>Winner:</strong> ${winnerName}</p>
        <p style="font-size: 24px; color: #72AEC8; margin: 10px 0 0 0; font-weight: bold;">
          ${new Intl.NumberFormat('en-US').format(currentPrice)} VND
        </p>
      </div>
      <p>The winner has been notified to complete payment. You will receive another notification once payment is confirmed.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          View Product
        </a>
      </div>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
  </div>
`;

export const auctionSellerNoBidsTemplate = (sellerName, productName, newAuctionUrl) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0;">Auction Ended</h1>
    </div>
    <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
      <p>Dear <strong>${sellerName}</strong>,</p>
      <p>Unfortunately, your auction has ended without any bidders.</p>
      <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #6c757d;">
        <h3 style="margin: 0 0 10px 0; color: #333;">${productName}</h3>
        <p style="color: #6c757d; margin: 0;">No bids received</p>
      </div>
      <p>You can relist this product or create a new auction with adjusted pricing.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${newAuctionUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Create New Auction
        </a>
      </div>
    </div>
    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
    <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
  </div>
`;

// ==========================================
// 6. OTP/AUTH TEMPLATES (RAW HTML)
// ==========================================

export const generateOtpEmail = (fullname, otp, options = {}) => {
  const {
    isRegister = false,
    isNew = false,
    isPasswordReset = false,
    verifyUrl = '#'
  } = options;

  if (isRegister) {
    return `<p>Hi ${fullname},</p>
<p>Thank you for registering at Online Auction.</p>
<p>Your OTP code is: <strong>${otp}</strong></p>
<p>This code will expire in 15 minutes.</p>
<p>You can enter this code on the verification page, or click the link below:</p>
<p><a href="${verifyUrl}">Verify your email</a></p>
<p>If you did not register, please ignore this email.</p>`;
  }

  const newText = isNew ? 'new ' : '';
  const resetText = isPasswordReset ? ' for password reset' : '';

  return `<p>Hi ${fullname},</p>
<p>Your ${newText}OTP code${resetText} is: <strong>${otp}</strong></p>
<p>This code will expire in 15 minutes.</p>`;
};