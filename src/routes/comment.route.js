import express from 'express';
import * as productCommentModel from '../models/productComment.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import { notifyNewComment } from '../services/mail.service.js';
const router = express.Router();

// ROUTE: POST COMMENT
router.post('/', isAuthenticated, async (req, res) => {
  const { productId, content, parentId } = req.body;
  const userId = req.session.authUser.id;

  try {
    if (!content || content.trim().length === 0) {
      req.session.error_message = 'Comment cannot be empty';
      return res.redirect(`/products/detail?id=${productId}`);
    }

    const cleanContent = content.trim();
    
    // Create comment
    await productCommentModel.createComment(productId, userId, cleanContent, parentId || null);

    const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;
    notifyNewComment(productId, userId, cleanContent, parentId, productUrl);

    req.session.success_message = 'Comment posted successfully!';
    res.redirect(`/products/detail?id=${productId}`);

  } catch (error) {
    console.error('Post comment error:', error);
    req.session.error_message = 'Failed to post comment. Please try again.';
    res.redirect(`/products/detail?id=${productId}`);
  }
});

export default router;