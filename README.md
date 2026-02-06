## Command Cheatsheet (Quick Commands)

> Run all commands in the project root (e.g., `D:\Amazon_backend`)

## Command Cheatsheet — Quick Commands

Short list of commands for development and acceptance testing.

> Run all commands from the project root (for example: `D:\Amazon_backend`).

----------------------------------------------------------------------------------------

## Prerequisites
- Docker (for the Postgres database)
- Node.js and npm

## 0. Prepare environment
Create a `.env` file from the example and edit values.

Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

Windows (CMD):
```cmd
copy .env.example .env
```

macOS / Linux:
```bash
cp .env.example .env
```

## 1. Install dependencies
```bash
npm install
```

## 2. Start the database (Docker)
```bash
docker compose up -d
docker ps
```

## 3. (Optional) Reset the database
Use when you want a fresh DB (recommended for acceptance tests):
```bash
docker compose down -v
docker compose up -d
```

## 4. Run database migrations
```bash
npx knex migrate:latest --env development
```

## 5. (Optional) Verify database tables
```bash
docker exec -it amazon_backend_pg psql -U app -d amazon_backend -c "\dt"
```

## 6. Start the backend (development)
```bash
npm run dev
```

## 7. Health check
```bash
curl http://localhost:3000/health
```

## 8. Acceptance: verify APIs (in order)
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

6) Restock (Admin)
```bash
curl -X POST http://localhost:3000/admin/inventory/restock \
	-H "Content-Type: application/json" \
	-d '{"productId":1,"qty":10}'
```

7) Query inventory again to confirm increment
```bash
curl http://localhost:3000/admin/inventory/1
```

## 9. Run tests
```bash
npm test
```

----------------------------------------------------------------------------------------