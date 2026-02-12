## Command Cheatsheet (Quick Commands)

> Run all commands from project root (for example: `D:\Amazon_backend`).

----------------------------------------------------------------------------------------

## Prerequisites
- Docker (for PostgreSQL)
- Node.js and npm

## 0. Prepare environment
Create `.env` manually in project root.

Example:
```env
PORT=3000
DATABASE_URL=postgres://app:app@localhost:5432/amazon_backend
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amazon_backend
DB_USER=app
DB_PASSWORD=app
```

## 1. Install dependencies
```bash
npm install
```

## 2. Start database (Docker)
```bash
docker compose up -d
docker ps
```

## 3. (Optional) Reset database
Use this when you want a clean DB state (recommended before acceptance tests):
```bash
docker compose down -v
docker compose up -d
```

## 4. Run migrations
```bash
npx knex migrate:latest --env development
```

## 5. (Optional) Verify DB tables
```bash
docker exec -it amazon_backend_pg psql -U app -d amazon_backend -c "\dt"
```

## 6. Start backend (development)
```bash
npm run dev
```

## 7. Health check
```bash
curl http://localhost:3000/health
```

## 8. Acceptance: verify APIs in order
1) Create product (Admin)
```bash
curl -X POST http://localhost:3000/admin/products \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-001","name":"Apple","price":"19.99"}'
```

2) Product list (User)
```bash
curl http://localhost:3000/products
```

3) Product detail (User)
```bash
curl http://localhost:3000/products/1
```

4) Update product (Admin)
```bash
curl -X PATCH http://localhost:3000/admin/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Apple Updated","price":"29.99"}'
```

5) Get inventory (Admin)
```bash
curl http://localhost:3000/admin/inventory/1
```

6) Restock inventory (Admin)
```bash
curl -X POST http://localhost:3000/admin/inventory/restock \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"qty":10}'
```

7) Verify inventory again
```bash
curl http://localhost:3000/admin/inventory/1
```

8) Add item to cart
```bash
curl -X POST http://localhost:3000/cart/items \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"productId":1,"qty":2}'
```

9) Checkout (requires `Idempotency-Key`)
```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-001" \
  -d '{"userId":1,"cartId":1}'
```

10) Retry checkout with same key (should return same order response)
```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-001" \
  -d '{"userId":1,"cartId":1}'
```

11) Remove item from cart (for cart API check)
```bash
curl -X DELETE "http://localhost:3000/cart/items/1?userId=1"
```

## 9. Checkout behavior notes
- Missing `Idempotency-Key` returns `400`.
- Reusing the same key returns cached response (no duplicate order).
- Concurrent checkout for the last unit should result in one success and one insufficient-stock failure.

## 10. Run tests
```bash
npm test
```

Run checkout tests only:
```bash
npm run test -- test/checkout.service.test.js
```

## 11. Current test suites
- `test/product.service.test.js`
- `test/inventory.service.test.js`
- `test/cart.service.test.js`
- `test/checkout.service.test.js`

----------------------------------------------------------------------------------------
