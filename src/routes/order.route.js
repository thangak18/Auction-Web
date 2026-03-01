import express from 'express';
import * as reviewModel from '../models/review.model.js';
import * as orderModel from '../models/order.model.js';
import * as invoiceModel from '../models/invoice.model.js';
import * as orderChatModel from '../models/orderChat.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import db from '../utils/db.js';
import { uploadService } from '../middlewares/upload.mdw.js';
const router = express.Router();

// ===================================================================================
// IMAGE UPLOAD FOR PAYMENT/SHIPPING PROOFS
// ===================================================================================

router.post('/upload-images', isAuthenticated, uploadService.arrayImages(5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const urls = req.files.map(file => `uploads/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

// ===================================================================================
// ORDER PAYMENT & SHIPPING ROUTES
// ===================================================================================

// Submit payment (Buyer)
router.post('/:orderId/submit-payment', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { payment_method, payment_proof_urls, note, shipping_address, shipping_phone } = req.body;
    
    // Verify user is buyer
    const order = await orderModel.findById(orderId);
    if (!order || order.buyer_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Create payment invoice
    await invoiceModel.createPaymentInvoice({
      order_id: orderId,
      issuer_id: userId,
      payment_method,
      payment_proof_urls,
      note
    });
    
    // Update order
    await orderModel.updateShippingInfo(orderId, {
      shipping_address,
      shipping_phone
    });
    
    await orderModel.updateStatus(orderId, 'payment_submitted', userId);
    
    res.json({ success: true, message: 'Payment submitted successfully' });
  } catch (error) {
    console.error('Submit payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit payment' });
  }
});

// Confirm payment (Seller)
router.post('/:orderId/confirm-payment', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    // Verify user is seller
    const order = await orderModel.findById(orderId);
    if (!order || order.seller_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Verify payment invoice
    const paymentInvoice = await invoiceModel.getPaymentInvoice(orderId);
    if (!paymentInvoice) {
      return res.status(400).json({ error: 'No payment invoice found' });
    }
    
    await invoiceModel.verifyInvoice(paymentInvoice.id);
    await orderModel.updateStatus(orderId, 'payment_confirmed', userId);
    
    res.json({ success: true, message: 'Payment confirmed successfully' });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm payment' });
  }
});

// Submit shipping (Seller)
router.post('/:orderId/submit-shipping', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { tracking_number, shipping_provider, shipping_proof_urls, note } = req.body;
    
    // Verify user is seller
    const order = await orderModel.findById(orderId);
    if (!order || order.seller_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Create shipping invoice
    await invoiceModel.createShippingInvoice({
      order_id: orderId,
      issuer_id: userId,
      tracking_number,
      shipping_provider,
      shipping_proof_urls,
      note
    });
    
    await orderModel.updateStatus(orderId, 'shipped', userId);
    
    res.json({ success: true, message: 'Shipping info submitted successfully' });
  } catch (error) {
    console.error('Submit shipping error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit shipping' });
  }
});

// Confirm delivery (Buyer)
router.post('/:orderId/confirm-delivery', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    // Verify user is buyer
    const order = await orderModel.findById(orderId);
    if (!order || order.buyer_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await orderModel.updateStatus(orderId, 'delivered', userId);
    
    res.json({ success: true, message: 'Delivery confirmed successfully' });
  } catch (error) {
    console.error('Confirm delivery error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm delivery' });
  }
});

// Submit rating (Both)
router.post('/:orderId/submit-rating', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { rating, comment } = req.body;
    
    // Verify user is buyer or seller
    const order = await orderModel.findById(orderId);
    if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Determine who is being rated
    const isBuyer = order.buyer_id === userId;
    const reviewerId = userId;
    const revieweeId = isBuyer ? order.seller_id : order.buyer_id;
    
    // Convert rating to number (positive = 1, negative = -1)
    const ratingValue = rating === 'positive' ? 1 : -1;
    
    // Check if already rated
    const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);
    
    if (existingReview) {
      // Update existing review
      await reviewModel.updateByReviewerAndProduct(reviewerId, order.product_id, {
        rating: ratingValue,
        comment: comment || null
      });
    } else {
      // Create new review (using existing create function)
      await reviewModel.create({
        reviewer_id: reviewerId,
        reviewed_user_id: revieweeId,
        product_id: order.product_id,
        rating: ratingValue,
        comment: comment || null
      });
    }
    
    // Check if both parties have completed (rated or skipped)
    const buyerReview = await reviewModel.getProductReview(order.buyer_id, order.seller_id, order.product_id);
    const sellerReview = await reviewModel.getProductReview(order.seller_id, order.buyer_id, order.product_id);
    
    if (buyerReview && sellerReview) {
      // Both completed, mark order as completed
      await orderModel.updateStatus(orderId, 'completed', userId);
      
      // Update product as sold and set closed_at to payment completion time
      await db('products').where('id', order.product_id).update({ 
        is_sold: true,
        closed_at: new Date()
      });
    }
    
    res.json({ success: true, message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit rating' });
  }
});

// Complete transaction without rating (skip)
router.post('/:orderId/complete-transaction', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    // Verify user is buyer or seller
    const order = await orderModel.findById(orderId);
    if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Determine who is being rated
    const isBuyer = order.buyer_id === userId;
    const reviewerId = userId;
    const revieweeId = isBuyer ? order.seller_id : order.buyer_id;
    
    // Create review record with rating=0 to indicate "skipped"
    const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);
    
    if (!existingReview) {
      await reviewModel.create({
        reviewer_id: reviewerId,
        reviewed_user_id: revieweeId,
        product_id: order.product_id,
        rating: 0, // 0 means skipped
        comment: null
      });
    }
    
    // Check if both parties have completed (rated or skipped)
    const buyerReview = await reviewModel.getProductReview(order.buyer_id, order.seller_id, order.product_id);
    const sellerReview = await reviewModel.getProductReview(order.seller_id, order.buyer_id, order.product_id);
    
    if (buyerReview && sellerReview) {
      // Both completed, mark order as completed
      await orderModel.updateStatus(orderId, 'completed', userId);
      
      // Update product as sold and set closed_at to payment completion time
      await db('products').where('id', order.product_id).update({ 
        is_sold: true,
        closed_at: new Date()
      });
    }
    
    res.json({ success: true, message: 'Transaction completed' });
  } catch (error) {
    console.error('Complete transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete transaction' });
  }
});

// Send message (Chat)
router.post('/:orderId/send-message', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { message } = req.body;
    
    // Verify user is buyer or seller
    const order = await orderModel.findById(orderId);
    if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await orderChatModel.sendMessage({
      order_id: orderId,
      sender_id: userId,
      message
    });
    
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
});

// Get chat messages for an order
router.get('/:orderId/messages', isAuthenticated, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    // Verify user is buyer or seller
    const order = await orderModel.findById(orderId);
    if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get messages
    const messages = await orderChatModel.getMessagesByOrderId(orderId);
    
    // Generate HTML for messages
    let messagesHtml = '';
    messages.forEach(msg => {
      const isSent = msg.sender_id === userId;
      const messageClass = isSent ? 'text-end' : '';
      const bubbleClass = isSent ? 'sent' : 'received';
      
      // Format date: HH:mm:ss DD/MM/YYYY
      const msgDate = new Date(msg.created_at);
      const year = msgDate.getFullYear();
      const month = String(msgDate.getMonth() + 1).padStart(2, '0');
      const day = String(msgDate.getDate()).padStart(2, '0');
      const hour = String(msgDate.getHours()).padStart(2, '0');
      const minute = String(msgDate.getMinutes()).padStart(2, '0');
      const second = String(msgDate.getSeconds()).padStart(2, '0');
      const formattedDate = `${hour}:${minute}:${second} ${day}/${month}/${year}`;
      
      messagesHtml += `
        <div class="chat-message ${messageClass}">
          <div class="chat-bubble ${bubbleClass}">
            <div>${msg.message}</div>
            <div style="font-size: 0.7rem; margin-top: 3px; opacity: 0.8;">${formattedDate}</div>
          </div>
        </div>
      `;
    });
    
    res.json({ success: true, messagesHtml });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message || 'Failed to get messages' });
  }
});

export default router;