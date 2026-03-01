import * as reviewModel from '../models/review.model.js'

export const getRatingPoint = async (userID) => {
  const ratingData = await reviewModel.calculateRatingPoint(userID);
  return ratingData ? ratingData.rating_point : 0;
}

export const calculateStatistics = (reviews) => {
  if (!reviews) return { totalReviews: 0, positiveReviews: 0, negativeReviews: 0 };

  const totalReviews = reviews.length;
  const positiveReviews = reviews.filter(r => r.rating === 1).length;
  const negativeReviews = reviews.filter(r => r.rating === -1).length;

  return { totalReviews, positiveReviews, negativeReviews };
}