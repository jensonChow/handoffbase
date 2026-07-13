# Alibaba Cloud International Deployment

This bundle deploys the HandoffBase MCP backend to one Alibaba Cloud
International ECS instance in Singapore. It runs the current production image,
Postgres with pgvector, an explicit schema migration, and Caddy HTTPS. The
dashboard is intentionally not part of this judging deployment.

## Cost boundary

- Use one prepaid ECS subscription covered by the hackathon coupon.
- Keep ECS auto-renewal disabled.
- Use prepaid fixed-bandwidth networking and do not add snapshots, managed
  databases, load balancers, paid security products, or marketplace images.
- Enable Model Studio **Free Quota Only** separately for
  `qwen-plus-2025-09-11` and `text-embedding-v4`. Those exact model rows are
  the model-inference hard stops.
- Alibaba budgets and alerts are notifications, not a guaranteed account-wide
  billing cutoff. Monitor the remaining coupon and do not run the credentialed
  LongMemEval benchmark before judging ends.

## Host preparation

Run these commands on a fresh Ubuntu 24.04 x86_64 ECS instance before starting
Postgres. The swapfile protects the 4 GiB host during the multi-stage Docker
build, which also compiles the dashboard even though the runtime image excludes
it.

```sh
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
```

Clone the public repository and pin the reviewed commit:

```sh
sudo mkdir -p /opt/handoffbase
sudo chown "$USER":"$USER" /opt/handoffbase
git clone https://github.com/jensonChow/handoffbase.git /opt/handoffbase/src
cd /opt/handoffbase/src
git rev-parse HEAD
```

Deploy only a reviewed commit and record its full SHA in the deployment proof.
Do not deploy an unreviewed moving branch.

Keep runtime configuration outside both the checkout and Docker build context.
Create a root-owned file, then edit it through `sudoedit`:

```sh
sudo install -d -o root -g root -m 700 /etc/handoffbase
sudo touch /etc/handoffbase/runtime.env
sudo chown root:root /etc/handoffbase/runtime.env
sudo chmod 600 /etc/handoffbase/runtime.env
sudoedit /etc/handoffbase/runtime.env
```

The file must define these names. Replace every placeholder privately; do not
copy real values into chat, shell history, screenshots, documentation, Docker
build arguments, or source control.

```text
HANDOFFBASE_DOMAIN=<public-hostname>
HANDOFFBASE_IMAGE_TAG=<reviewed-short-sha>

POSTGRES_USER=handoffbase
POSTGRES_PASSWORD=<64-hex-character-secret>
POSTGRES_DB=handoffbase

HANDOFFBASE_API_KEY=<64-hex-character-judge-token>
HANDOFFBASE_TENANT_ID=demo-tenant
HANDOFFBASE_USER_ID=demo-user
HANDOFFBASE_ACTOR_TYPE=mcp_host
HANDOFFBASE_ACTOR_ID=judge-client

QWEN_API_KEY=<dedicated-international-model-studio-key>
QWEN_TIMEOUT_MS=30000
HANDOFFBASE_READINESS_TIMEOUT_MS=5000
```

Generate the database and judge-access secrets with a cryptographically secure
password generator; `openssl rand -hex 32` produces the required URL-safe form.
Use a dedicated Qwen Cloud International key. The Compose bundle fixes the
DashScope international base URL, Qwen model, embedding model, and 1536-vector
dimension rather than accepting cost-affecting overrides from this file.

In the ECS security group, allow TCP 80 and 443 publicly, restrict TCP 22 to the
operator's current IP, and do not add rules for 3000 or 5432. Compose publishes
only Caddy; the app and database are reachable solely on private Docker
networks.

Build before starting Postgres, then launch the stack:

```sh
sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  config --quiet

sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  build app

sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  up -d
```

The app and one-shot migration run as the image's unprivileged `node` user with
a read-only filesystem and no Linux capabilities. Container JSON logs are
rotated to protect the 40 GiB system disk. Do not run plain
`docker compose config` in captured output because it prints resolved runtime
values; use `config --quiet`.

## Validation

Check the modes without exposing credentials:

```sh
curl -fsS "https://$HANDOFFBASE_DOMAIN/health"
```

The response must report all four values:

```text
authMode=api_key
providerMode=qwen
storeMode=postgres
embeddingMode=qwen
```

Run readiness and the full remote MCP validation through the final HTTPS
hostname. In the operator shell, set the public hostname and read the token
without echoing it or placing it in shell history:

```sh
export HANDOFFBASE_DOMAIN=replace-with-public-hostname
read -rsp "HandoffBase judge token: " MCP_AUTH_TOKEN
export MCP_AUTH_TOKEN
printf '\n'

curl -fsS \
  -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  "https://$HANDOFFBASE_DOMAIN/ready"

EXPECTED_AUTH_MODE=api_key \
EXPECTED_PROVIDER_MODE=qwen \
EXPECTED_STORE_MODE=postgres \
EXPECTED_EMBEDDING_MODE=qwen \
MCP_ENDPOINT="https://$HANDOFFBASE_DOMAIN/mcp" \
MCP_AUTH_TOKEN=${MCP_AUTH_TOKEN} \
npm run mcp:validate-remote
```

The `alibaba-demo` validator profile is not used because that legacy profile
expects `storeMode=in-memory`.

Use `/health`, not `/ready`, for frequent availability monitoring. `/health`
does not contact Qwen; each uncached authenticated `/ready` request performs a
one-token provider probe. The Compose health check uses `/health`.

`embeddingMode=qwen` proves that the embedding provider was configured. Because
embedding calls deliberately degrade to lexical recall on provider failure,
also verify after `memory_remember` that Postgres contains an embedding row:

```sh
sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  exec -T postgres \
  psql -U handoffbase -d handoffbase -tAc \
  'select count(*) from memory_embeddings;'
```

The result must be greater than zero.

## Persistence and backup proof

After the remote validator writes a memory, restart only the application and
recall the same memory:

```sh
sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  restart app
```

Create a compressed logical backup and copy it off ECS before judging:

```sh
mkdir -p /opt/handoffbase/backups
sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > /opt/handoffbase/backups/handoffbase.dump

sudo docker compose \
  --env-file /etc/handoffbase/runtime.env \
  -f deploy/alibaba/compose.yaml \
  exec -T postgres \
  pg_restore --list \
  < /opt/handoffbase/backups/handoffbase.dump \
  > /dev/null
```

The backup is not complete until `handoffbase.dump` has been copied to a
different machine and its archive listing has been verified there.
