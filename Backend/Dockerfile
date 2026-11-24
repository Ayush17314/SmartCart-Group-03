FROM node:20-alpine

WORKDIR /app

# Copy root backend package configuration
COPY package.json free-ports.js start-all.js ./

# Copy microservice package files for optimal Docker layer caching
COPY api-gateway/package*.json ./api-gateway/
COPY auth-service/package*.json ./auth-service/
COPY product-service/package*.json ./product-service/
COPY cart-service/package*.json ./cart-service/
COPY wishlist-service/package*.json ./wishlist-service/
COPY order-service/package*.json ./order-service/
COPY payment-service/package*.json ./payment-service/
COPY notification-service/package*.json ./notification-service/

# Install root dependencies (concurrently) and production dependencies for all services
RUN npm install --omit=dev && \
    npm --prefix api-gateway install --omit=dev && \
    npm --prefix auth-service install --omit=dev && \
    npm --prefix product-service install --omit=dev && \
    npm --prefix cart-service install --omit=dev && \
    npm --prefix wishlist-service install --omit=dev && \
    npm --prefix order-service install --omit=dev && \
    npm --prefix payment-service install --omit=dev && \
    npm --prefix notification-service install --omit=dev

# Copy all microservice source directories
COPY api-gateway/ ./api-gateway/
COPY auth-service/ ./auth-service/
COPY product-service/ ./product-service/
COPY cart-service/ ./cart-service/
COPY wishlist-service/ ./wishlist-service/
COPY order-service/ ./order-service/
COPY payment-service/ ./payment-service/
COPY notification-service/ ./notification-service/

# Expose the unified API Gateway entry port
EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS="--max-old-space-size=96"

CMD ["npm", "start"]
