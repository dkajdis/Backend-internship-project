# Amazon Backend Service

Node.js + Express ecommerce backend focused on safe checkout and async order processing.

Core capabilities:
- JWT login and role-based admin authorization
- Product and inventory management
- Cart and idempotent checkout
- Async payment processing via SQS + worker
- Retry and DLQ protections for failed messages
- JSON request logs with request ID
- Real Postgres integration test in CI

## Architecture Diagram
![System Architecture](docs/architecture.png)

## Live Proof (AWS)
Base URL:
`http://amazon-backend-alb-413581082.ap-east-1.elb.amazonaws.com`

1. Health endpoint returns `200 OK`:
![Health 200](docs/live/01-health-200.png)

2. Checkout returns `pending` first:
![Checkout Pending](docs/live/02-checkout-pending.png)

3. Order reaches final status after worker processing:
![Order Final Status](docs/live/03-order-final-status.png)

4. Worker processing evidence in CloudWatch Logs:
![Worker CloudWatch](docs/live/04-worker-cloudwatch.png)

## Checkout And Async Flow
1. Client calls `POST /checkout` with `Idempotency-Key`.
2. API opens a DB transaction and locks inventory rows (`FOR UPDATE`).
3. API creates order in `pending`, writes order items, marks cart as `checked_out`, and stores idempotency response.
4. API commits transaction.
5. API publishes `{ orderId }` to SQS main queue.
6. Worker long-polls SQS and processes payment.
7. Worker updates order status:
- Payment success -> `CONFIRMED`
- Payment failure -> `CANCELLED` and restore inventory
8. If processing keeps failing and receive count reaches threshold, worker moves message to DLQ.

Status meanings:
- `pending`: order is already created, but payment is not settled yet
- `CONFIRMED`: payment succeeded
- `CANCELLED`: payment failed and inventory has been compensated

## Project Structure
```text
src/
  app.js
  server.js
  controllers/
  services/
  repositories/
  routes/
  middlewares/
  workers/payment.worker.js
  db/pool.js
migrations/
test/
.github/workflows/ci.yml
docs/architecture.png
```

## Prerequisites
- Node.js 20+
- npm
- Docker (for local Postgres)
- AWS credentials and SQS queues (only if running real async worker path)

## Quick Start (Local)
1. Install dependencies:
```bash
npm install
```

2. Start Postgres:
```bash
docker compose up -d
```

3. Create `.env` in project root (template below).

4. Run migrations:
```bash
npx knex migrate:latest --env development
```

5. Start API:
```bash
npm run dev
```

6. Optional: start worker:
```bash
npm run worker:payment
```
If `SQS_QUEUE_URL` is empty, skip this step because worker requires a queue URL.

7. Verify health:
```bash
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## `.env` Template
```env
PORT=3000

DATABASE_URL=postgresql://app:app_password@localhost:5432/amazon_backend
DB_HOST=localhost
DB_PORT=5432
DB_NAME=amazon_backend
DB_USER=app
DB_PASSWORD=app_password

JWT_SECRET=replace_with_a_strong_secret
JWT_EXPIRES_IN_SECONDS=3600
DEMO_ADMIN_PASSWORD=admin123
DEMO_USER_PASSWORD=user123

AWS_REGION=us-east-1
SQS_QUEUE_URL=
SQS_DLQ_URL=
SQS_SEND_MAX_RETRIES=2
SQS_SEND_RETRY_DELAY_MS=100

PAYMENT_SIMULATION_MODE=random
PAYMENT_SUCCESS_RATE=0.7

SQS_POLL_WAIT_SECONDS=20
SQS_POLL_MAX_MESSAGES=5
SQS_VISIBILITY_TIMEOUT_SECONDS=30
SQS_POLL_IDLE_DELAY_MS=1000
SQS_WORKER_MAX_RECEIVE_COUNT=5
SQS_PROCESS_TIMEOUT_MS=15000
SQS_POLL_TIMEOUT_MS=25000
SQS_SHUTDOWN_GRACE_MS=10000

HTTP_REQUEST_TIMEOUT_MS=15000
HTTP_HEADERS_TIMEOUT_MS=60000
HTTP_KEEP_ALIVE_TIMEOUT_MS=5000
HTTP_SHUTDOWN_GRACE_MS=10000
```

## Environment Variables Matrix
| Variable | Used By | Required | Default | Notes |
|---|---|---|---|---|
| `PORT` | API | No | `3000` | HTTP listen port |
| `DATABASE_URL` | API, Worker | Yes | none | Postgres connection string for runtime |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Knex migrations | Yes (for migration) | none | Read by `knexfile.js` |
| `JWT_SECRET` | API | Yes | none | Required for `/auth/login` and auth middleware |
| `JWT_EXPIRES_IN_SECONDS` | API | No | `3600` | Token TTL |
| `DEMO_ADMIN_PASSWORD` | API | No | `admin123` | Demo login password for `admin` |
| `DEMO_USER_PASSWORD` | API | No | `user123` | Demo login password for `user` |
| `AWS_REGION` | API, Worker | No | `us-east-1` | SQS client region |
| `SQS_QUEUE_URL` | API, Worker | API: No, Worker: Yes | none | API publishes checkout event, worker consumes |
| `SQS_DLQ_URL` | Worker | No | none | Needed if worker should move poison messages to DLQ |
| `SQS_SEND_MAX_RETRIES` | API | No | `2` | Publish retry count |
| `SQS_SEND_RETRY_DELAY_MS` | API | No | `100` | Backoff base delay for publish retries |
| `PAYMENT_SIMULATION_MODE` | Worker | No | `random` | `random` or `rule_based` |
| `PAYMENT_SUCCESS_RATE` | Worker | No | `0.7` | Success probability in random mode |
| `SQS_POLL_WAIT_SECONDS` | Worker | No | `20` | Long polling wait |
| `SQS_POLL_MAX_MESSAGES` | Worker | No | `5` | Max per poll (capped at 10) |
| `SQS_VISIBILITY_TIMEOUT_SECONDS` | Worker | No | `30` | Message visibility timeout |
| `SQS_POLL_IDLE_DELAY_MS` | Worker | No | `1000` | Sleep when no messages/errors |
| `SQS_WORKER_MAX_RECEIVE_COUNT` | Worker | No | `5` | Retry ceiling before DLQ/drop logic |
| `SQS_PROCESS_TIMEOUT_MS` | Worker | No | `15000` | Per-message processing timeout |
| `SQS_POLL_TIMEOUT_MS` | Worker | No | `waitTime*1000+5000` | Timeout guard for SQS receive call |
| `SQS_SHUTDOWN_GRACE_MS` | Worker | No | `10000` | Grace period to drain in-flight messages |
| `HTTP_REQUEST_TIMEOUT_MS` | API | No | `15000` | Node server request timeout |
| `HTTP_HEADERS_TIMEOUT_MS` | API | No | `keepAlive+1000` | Node server headers timeout |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | API | No | `5000` | Node keep-alive timeout |
| `HTTP_SHUTDOWN_GRACE_MS` | API | No | `10000` | Grace period for API shutdown |

## API Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Liveness check |
| `GET` | `/ready` | None | Readiness check (DB connectivity) |
| `POST` | `/auth/login` | None | Demo login, returns JWT |
| `GET` | `/products` | None | List products |
| `GET` | `/products/:id` | None | Product detail |
| `POST` | `/admin/products` | Bearer admin | Create product |
| `PATCH` | `/admin/products/:id` | Bearer admin | Update product fields |
| `POST` | `/admin/inventory/restock` | Bearer admin | Increase inventory quantity |
| `GET` | `/admin/inventory/:productId` | Bearer admin | Get inventory by product |
| `POST` | `/cart/items` | None | Add item to user open cart |
| `DELETE` | `/cart/items/:productId` | None | Remove item from user open cart (`userId` from query/body) |
| `POST` | `/checkout` | None + `Idempotency-Key` header | Create pending order and publish event |
| `GET` | `/orders/:id` | None | Get order with items |
| `GET` | `/orders?userId=...` | None | List orders by user |

Important behavior notes:
- Admin routes are protected with `requireAuth` + `requireRole("admin")`.
- Cart/checkout/orders endpoints are currently not JWT-protected and rely on explicit `userId` input.
- `POST /checkout` returns the same response for repeated requests with the same idempotency key.
- If `SQS_QUEUE_URL` is empty, checkout still succeeds in DB but no queue message is sent.

## Auth Quick Start
Get admin token:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

Set token variable from the `accessToken` field in login response:
```bash
TOKEN='paste_access_token_here'
```

Then use it in authenticated calls:
```bash
curl -X POST http://localhost:3000/admin/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-001","name":"Apple","price":"19.99"}'
```

## Manual Acceptance Flow
1. Login as admin and get JWT, then set:
```bash
TOKEN='paste_access_token_here'
```
2. Create product:
```bash
curl -X POST http://localhost:3000/admin/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sku":"SKU-001","name":"Apple","price":"19.99"}'
```
3. Restock:
```bash
curl -X POST http://localhost:3000/admin/inventory/restock \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"qty":10}'
```
4. Add item to cart:
```bash
curl -X POST http://localhost:3000/cart/items \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"productId":1,"qty":2}'
```
5. Checkout:
```bash
curl -X POST http://localhost:3000/checkout \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: idem-001" \
  -d '{"userId":1,"cartId":1}'
```
6. Query order:
```bash
curl http://localhost:3000/orders/1
curl "http://localhost:3000/orders?userId=1"
```

## Logging And Observability
- Request ID middleware sets/propagates `x-request-id`.
- API request log event: `http_request` with `requestId`, `path`, `status`, `orderId`, `durationMs`.
- Error log event: `http_error`.
- Worker logs include processing outcomes (`order_processed`, `order_process_failed`, `message_moved_to_dlq`).
- Logs are JSON to stdout/stderr and can be collected by ECS `awslogs` into CloudWatch Logs.

## Testing
Run full test suite:
```bash
npm test
```

Run integration test only:
```bash
npm run test:integration
```

Integration test scope:
- Uses real Postgres.
- Executes end-to-end API checkout flow.
- Intentionally sets `SQS_QUEUE_URL=""` so tests do not require live SQS.

## CI
Workflow file: `.github/workflows/ci.yml`

CI pipeline:
1. Start `postgres:16` service container.
2. Install Node dependencies.
3. Run migrations.
4. Run `npm test`.

CI notes:
- CI validates API + DB behavior.
- CI does not run a live SQS queue or long-running worker service.

## AWS Deployment Checklist
1. Provision resources:
- RDS Postgres
- SQS main queue
- SQS DLQ
- ECS service for API
- ECS service for worker
- ALB for API service

2. Configure SQS redrive:
- Main queue redrive target -> DLQ
- `maxReceiveCount` should match `SQS_WORKER_MAX_RECEIVE_COUNT` (for example `5`)

3. Configure ECS task definition variables:
- API: `DATABASE_URL`, `JWT_SECRET`, `AWS_REGION`, `SQS_QUEUE_URL`
- Worker: `DATABASE_URL`, `AWS_REGION`, `SQS_QUEUE_URL`, `SQS_DLQ_URL`, worker timeout/retry variables

4. Use Secrets Manager for secrets:
- Prefer `ValueFrom` in task definition for `JWT_SECRET` and DB credentials.
- Do not use placeholder secrets in production.

5. IAM requirements:
- `ecsTaskExecutionRole` needs permission to read Secrets Manager values used by task definition (`secretsmanager:GetSecretValue`, and `kms:Decrypt` if customer KMS key is used).
- Task role permissions:
  - API -> `sqs:SendMessage` on main queue
  - Worker -> `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility` on main queue
  - Worker -> `sqs:SendMessage` on DLQ

6. Verification:
- Check `/health` and `/ready` on deployed API.
- Trigger checkout and confirm order transitions in DB.
- Confirm worker logs and DLQ behavior in CloudWatch.

## Troubleshooting
`ResourceInitializationError` for Secrets Manager:
- Cause: ECS execution role cannot call `secretsmanager:GetSecretValue`.
- Fix: add IAM policy to `ecsTaskExecutionRole` for the specific secret ARN.

Service keeps deploying or replacing tasks:
- Check target group health check path/port (`/health`, container port `3000`).
- Check startup logs in CloudWatch.
- Verify required env vars are present and valid.

Checkout succeeds but no async processing:
- Verify API has valid `SQS_QUEUE_URL`.
- Verify worker is running with correct queue URL and AWS permissions.

Messages keep retrying and never drain:
- Verify main queue redrive policy is configured.
- Verify `SQS_DLQ_URL` is set for worker if you want explicit move-to-DLQ behavior.

Admin endpoints return `401` or `403`:
- Ensure `Authorization: Bearer <token>` is included.
- Ensure logged-in user role is `admin`.
- Ensure `JWT_SECRET` is configured and consistent across login + API validation.
