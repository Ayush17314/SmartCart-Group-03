# SmartCart Cart Service

The Cart Service manages persistent shopping carts for authenticated customers in the `smartcart_cart` MongoDB database.

---

## Architectural Role

- **User-Isolated Storage:** Each authenticated customer maintains a dedicated shopping cart record identified by their user ID.
- **Dynamic Pricing & Quantities:** Updates quantities, validates maximum line-item bounds, and calculates subtotal amounts dynamically.
- **Cross-Service Cart Clearing:** When an order is placed in `order-service`, the customer's cart is automatically cleared.

---

## Environment Configuration

Configure in `Backend/.env` or `Backend/cart-service/.env`:

```env
PORT=4003
MONGODB_DB=smartcart_cart
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
PRODUCT_SERVICE_URL=http://localhost:4002
CORS_ORIGIN=http://localhost:3000
```

---

## Endpoints Reference

| Method | Endpoint | Authorization | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `GET` | `/api/cart` | Bearer Token | Retrieve current customer's shopping cart |
| `POST` | `/api/cart/items` | Bearer Token | Add an item to cart or increment quantity (supports `Idempotency-Key`) |
| `PUT` | `/api/cart/items/:productId` | Bearer Token | Update line-item quantity |
| `DELETE`| `/api/cart/items/:productId` | Bearer Token | Remove a specific item from cart |
| `DELETE`| `/api/cart` | Bearer Token | Clear all items from the customer's cart |
