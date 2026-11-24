# SmartCart Wishlist Service

The Wishlist Service manages saved items and personal wishlists for authenticated customers in the `smartcart_wishlist` MongoDB database.

---

## Architectural Role

- **Saved Items Management:** Enables customers to save products for later purchasing without cluttering their active shopping cart.
- **Move to Cart:** Works alongside the storefront to transition saved items into active cart items seamlessly.

---

## Environment Configuration

Configure in `Backend/.env` or `Backend/wishlist-service/.env`:

```env
PORT=4004
MONGODB_DB=smartcart_wishlist
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
PRODUCT_SERVICE_URL=http://localhost:4002
CORS_ORIGIN=http://localhost:3000
```

---

## Endpoints Reference

| Method | Endpoint | Authorization | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `GET` | `/api/wishlist` | Bearer Token | Retrieve current customer's saved wishlist |
| `POST` | `/api/wishlist/items` | Bearer Token | Add a product to the customer's wishlist |
| `DELETE`| `/api/wishlist/items/:productId` | Bearer Token | Remove a specific product from the wishlist |
| `DELETE`| `/api/wishlist` | Bearer Token | Clear all items from the customer's wishlist |
