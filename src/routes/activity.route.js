import express from 'express';
import * as watchlistModel from '../models/watchlist.model.js';
import * as reviewModel from '../models/review.model.js';
import * as autoBiddingModel from '../models/autoBidding.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';

const router = express.Router();

// Ratings & Reviews
router.get('/ratings', isAuthenticated, async (req, res) => {
  const reviews = await reviewModel.getReviewsByUserId(req.session.authUser.id);
  res.render('vwAccount/rating', { reviews });
});

router.post('/won-auctions/:productId/rate-seller', isAuthenticated, async (req, res) => {
  const { rating, comment } = req.body;
  const review = {
    product_id: req.params.productId,
    reviewer_id: req.session.authUser.id,
    rating,
    comment,
    created_at: new Date()
  };
  await reviewModel.add(review);
  res.redirect('/account/auctions');
});

// Watchlist
router.get('/watchlist', isAuthenticated, async (req, res) => {
  const products = await watchlistModel.searchPageByUserId(req.session.authUser.id, 10, 0);
  res.render('vwAccount/watchlist', { products });
});

// Đấu giá
router.get('/bidding', isAuthenticated, async (req, res) => {
  const products = await autoBiddingModel.getBiddingProductsByBidderId(req.session.authUser.id);
  res.render('vwAccount/bidding-products', { products });
});

router.get('/auctions', isAuthenticated, async (req, res) => {
  const products = await autoBiddingModel.getWonAuctionsByBidderId(req.session.authUser.id);
  res.render('vwAccount/won-auctions', { products });
});

// Seller management
router.get('/seller/products', isAuthenticated, (req, res) => {
  res.render('vwAccount/my-products');
});

export default router;