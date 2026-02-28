// Service chuyên chịu trách nhiệm xử lý logic của Product
export const determineProductStatus = (product) => {
    const now = new Date();
    const endDate = new Date(product.end_at);
    
    if (product.is_sold === true) return 'SOLD';
    if (product.is_sold === false) return 'CANCELLED';
    if ((endDate <= now || product.closed_at) && product.highest_bidder_id) return 'PENDING';
    if (endDate <= now && !product.highest_bidder_id) return 'EXPIRED';
    return 'ACTIVE';
};

export const checkViewPermission = (productStatus, userId, sellerId, highestBidderId) => {
    if (productStatus === 'ACTIVE') return true;
    if (!userId) return false;
    return (userId === sellerId || userId === highestBidderId);
};