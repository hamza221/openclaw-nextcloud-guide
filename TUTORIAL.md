Debian VPS · Docker · Development

# OpenClaw for Nextcloud development

This is the full text of the HTML tutorial, readable directly on GitHub. All optional sections are expanded below.

Set up an assistant that can reproduce bugs, test changes, and work with you in GitHub and Talk.

Step-by-step guide · Updated 17 Sep 2026 · macOS + Chrome

## Before you start

This guide builds a Nextcloud development assistant on a Debian VPS. You will run OpenClaw in Docker, connect a GitHub bot account, give it a private Nextcloud test instance, and add Talk messages and scheduled work.

Use a dedicated development VPS. The original walkthrough used Debian 13, four CPU cores, 16 GB of RAM, and about 200 GB of disk. Those are reference specs, not measured minimum requirements. You also need SSH access, a GitHub account for the bot, and a model provider account.

Commands marked **VPS** run on the server. Commands marked **Mac** run on your laptop. Blocks marked **OpenClaw chat** are instructions to send to the bot. Copy the command itself, without a terminal prompt or previous output.

| Example             | Replace with                             |
|---------------------|------------------------------------------|
| `203.0.113.10`      | Your VPS IP address                      |
| `claw.example.com`  | Your dashboard domain, optional          |
| `YOUR_BOT`          | The bot's GitHub username                |
| `YOUR_GITHUB_LOGIN` | Your own GitHub username                 |
| `nextcloud-bot`     | The OpenClaw agent ID used in this guide |

The walkthrough was assembled on 17 September 2026. The source session used OpenClaw 2026.9.4. Current upstream documentation informed the revised steps. This revised recipe has not been run end to end on a fresh VPS. Record your image digests and Git revisions so you can reproduce your own setup.

> This is a development guide. It does not install Nextcloud AIO or a production Nextcloud service. Nextcloud development branches are not an LTS release. The optional public hostname serves only the OpenClaw dashboard.

## 1. Prepare Debian and Docker

Connect from your Mac. These server commands assume a root shell, as in the original walkthrough.

**Mac · terminal**

``` bash
ssh root@203.0.113.10
```

**VPS · terminal**

``` bash
apt update
apt upgrade
apt install -y ca-certificates curl git nano openssl sudo python3
```

Install Docker Engine and the Compose plugin using the [official Debian repository instructions](https://docs.docker.com/engine/install/debian/#install-using-the-repository). Use their Debian package list, including `docker-compose-plugin`. Then verify:

**VPS · terminal**

``` bash
docker version
docker compose version
docker ps
dpkg --audit
```

This guide uses Compose's `!override` support, which requires Compose 2.24.4 or newer. Compose 5 also supports it. Keep SSH available in your provider firewall. Open TCP 80 and 443 only if you use the optional domain step. Do not open the gateway, development, or browser debugging ports to the internet.

> If apt reports a lock, inspect the process named in the error and let active package work finish. Do not delete lock files. If nano cannot open `xterm-ghostty`, run `TERM=xterm-256color nano FILENAME`.

## 2. Install OpenClaw with persistent tools

The bot needs GitHub CLI, Docker CLI, and a browser inside its container. Installing them by hand in a running container loses them at recreation. Build them into an image instead.

**VPS · terminal**

``` bash
git clone https://github.com/openclaw/openclaw.git /opt/openclaw
cd /opt/openclaw
git rev-parse HEAD > tutorial-source-revision.txt
docker pull ghcr.io/openclaw/openclaw:latest-browser
docker image inspect ghcr.io/openclaw/openclaw:latest-browser --format '{{index .RepoDigests 0}}' > tutorial-base-image.txt
```

Save [Dockerfile.tools](examples/Dockerfile.tools) as `/opt/openclaw/Dockerfile.tools`. It extends the official browser image and installs the command-line tools. Build using the recorded base digest:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker build --build-arg BASE_IMAGE="$(cat tutorial-base-image.txt)" -f Dockerfile.tools -t openclaw:dev-tools .
```

Before running onboarding, bind the stock Compose ports to localhost. The setup script explicitly selects its own Compose file, so an override alone is not enough for its first start. This edit stops if upstream changes the expected port entries:

**VPS · terminal**

``` bash
python3 - <<'PYCODE'
from pathlib import Path
p = Path('docker-compose.yml')
s = p.read_text()
for variable, port in [('OPENCLAW_GATEWAY_PORT',18789), ('OPENCLAW_BRIDGE_PORT',18790), ('OPENCLAW_MSTEAMS_PORT',3978)]:
    old = '"${' + variable + ':-' + str(port) + '}:' + str(port) + '"'
    new = '"127.0.0.1:' + str(port) + ':' + str(port) + '"'
    if s.count(old) != 1:
        raise SystemExit('Port layout changed. Review docker-compose.yml before continuing.')
    s = s.replace(old, new)
p.write_text(s)
PYCODE
export OPENCLAW_IMAGE=openclaw:dev-tools
bash ./scripts/docker/setup.sh --offline
```

The offline flag reuses the local image instead of looking for that custom tag in a registry. Model authentication still needs network access.

1.  Choose local gateway mode, port `18789`, and token authentication.
2.  Choose LAN binding inside the container. Docker publishes it only on the VPS loopback address.
3.  Choose the OpenAI OAuth option offered by your version. Complete the browser flow on your Mac. Follow the displayed headless callback instructions if needed.
4.  Keep Tailscale off for this recipe and skip channels for now. Skip installing a systemd service inside the container.
5.  Choose an available model and run the live completion check.

See the [Docker guide](https://docs.openclaw.ai/install/docker) and [headless OAuth instructions](https://docs.openclaw.ai/install/docker/compose-operations#openai-codex-oauth-headless-docker). The available model names and account options may differ from the original session.

**VPS · terminal**

``` bash
docker compose ps
docker compose exec openclaw-gateway gh --version
docker compose exec openclaw-gateway docker compose version
curl --max-time 10 -fsS http://127.0.0.1:18789/healthz
```

> Keep `.env`, the OpenClaw state directories, and OAuth credentials private. Record image digests and source revisions, but never publish the generated token.

## 3. Open the dashboard through SSH

Start a tunnel on your Mac and leave this terminal open:

**Mac · terminal**

``` bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:18789:127.0.0.1:18789 root@203.0.113.10
```

Open <http://127.0.0.1:18789/> in Chrome. On the VPS, get the dashboard access link:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js dashboard --no-open
```

Use the token locally. If device pairing is requested, list pending devices and approve only the request from your browser:

**VPS · terminal**

``` bash
docker compose exec openclaw-gateway node dist/index.js devices list
docker compose exec openclaw-gateway node dist/index.js devices approve REQUEST_ID
```

In the dashboard, create or select an agent with ID `nextcloud-bot`. Confirm the ID before using later agent-specific commands. Give it a clear role:

**OpenClaw chat**

``` text
You are nextcloud-bot, a development assistant for Nextcloud apps. Work with JavaScript, Vue, and PHP. Explain findings plainly. Use the private development instance for code changes, reproductions, and screenshots.
```

## 4. Optional: use a domain with a client certificate

You can stop at the SSH tunnel. For an actual domain, this step requires Chrome to present your client certificate before Caddy forwards dashboard traffic. Keep OpenClaw's token authentication enabled as well.

Create an A record for `claw.example.com` pointing to your VPS. Add an AAAA record only if IPv6 reaches the same service. Allow inbound TCP 80 and 443. If another proxy already owns those ports, add the site to that proxy rather than starting a second Caddy.

### Show the certificate and Caddy setup

On the VPS, generate a private CA and a client identity. The CA key can issue new client identities, so keep it private. This example creates a client certificate valid for 90 days.

**VPS · terminal**

``` bash
install -d -m 700 /root/openclaw-certs
cd /root/openclaw-certs
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -keyout ca.key -out ca.crt -days 365 -subj "/CN=OpenClaw Client CA" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl req -new -newkey rsa:3072 -nodes -keyout client.key -out client.csr -subj "/CN=OpenClaw Browser Access"
cat > client.ext <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=clientAuth
EOF
openssl x509 -req -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -days 90 -sha256 -extfile client.ext
openssl verify -purpose sslclient -CAfile ca.crt client.crt
openssl pkcs12 -export -out openclaw-access.p12 -inkey client.key -in client.crt -certfile ca.crt -name "OpenClaw access"
```

Choose an export password when prompted. Copy only the public CA certificate into Caddy's configuration directory:

**VPS · terminal**

``` bash
install -d -m 755 /opt/openclaw-proxy/client-ca
install -m 644 /root/openclaw-certs/ca.crt /opt/openclaw-proxy/client-ca/ca.crt
```

Save this as `/opt/openclaw-proxy/compose.yaml`:

**VPS · compose.yaml**

``` yaml
services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./client-ca:/etc/caddy/client-ca:ro
      - caddy_data:/data
      - caddy_config:/config
volumes:
  caddy_data:
  caddy_config:
```

Save this as `/opt/openclaw-proxy/Caddyfile`, after replacing the domain:

**VPS · Caddyfile**

``` text
claw.example.com {
    tls {
        client_auth {
            mode require_and_verify
            trust_pool file {
                pem_file /etc/caddy/client-ca/ca.crt
            }
        }
    }
    reverse_proxy 127.0.0.1:18789
}
```

Start Caddy and set the dashboard origin:

**VPS · terminal**

``` bash
cd /opt/openclaw-proxy
docker compose up -d
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js config set gateway.controlUi.allowedOrigins '["https://claw.example.com","http://127.0.0.1:18789"]' --strict-json
docker inspect "$(docker compose ps -q openclaw-gateway)" --format '{{range $name, $net := .NetworkSettings.Networks}}{{$name}} gateway={{$net.Gateway}}{{println}}{{end}}'
```

Host-network Caddy normally reaches the published port through a Docker bridge. Find the actual peer in gateway logs if it reports `proxy_attribution_required`. Trust only that address. The address below is an example, not a value to copy blindly:

**VPS · terminal**

``` bash
docker compose exec openclaw-gateway node dist/index.js config set gateway.trustedProxies '["172.19.0.1"]' --strict-json
docker compose restart --timeout 30 openclaw-gateway
```

Transfer the client identity to your Mac:

**Mac · terminal**

``` bash
scp root@203.0.113.10:/root/openclaw-certs/openclaw-access.p12 ~/Downloads/
open ~/Downloads/openclaw-access.p12
```

Import it into your login keychain with its export password. Confirm it appears under My Certificates with its private key. Reopen Chrome, visit your domain, and select that identity when prompted. You do not need to mark your private CA as trusted for public server certificates. Caddy obtains the server certificate separately.

Test both cases on the VPS. The first request must be rejected without a client certificate. The second should reach OpenClaw:

**VPS · terminal**

``` bash
curl --max-time 20 -I https://claw.example.com/
curl --max-time 20 --cert /root/openclaw-certs/client.crt --key /root/openclaw-certs/client.key -I https://claw.example.com/
```

After any later Caddyfile edit, validate and reload it. Validation alone does not apply changes:

**VPS · terminal**

``` bash
cd /opt/openclaw-proxy
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

References: [Caddy client authentication](https://caddyserver.com/docs/caddyfile/directives/tls), [forwarded headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), and [OpenClaw proxy security](https://docs.openclaw.ai/gateway/security).

## 5. Create the Nextcloud development instance

Use the official [nextcloud-docker-dev documentation](https://nextcloud.github.io/nextcloud-docker-dev/) for app builds, PHP versions, test mail, and database choices. The steps here connect that environment to OpenClaw.

Run the bootstrap on the VPS. This uses the correct repository, not `nextcloud/docker-ci`. Talk's repository and app ID are `spreed`.

**VPS · terminal**

``` bash
git clone https://github.com/nextcloud/nextcloud-docker-dev.git /srv/nextcloud-dev
cd /srv/nextcloud-dev
./bootstrap.sh --clone-no-blobs calendar contacts mail deck spreed
```

Before starting containers, edit `/srv/nextcloud-dev/.env`. Keep the generated paths and database settings. Set these values, replacing existing entries rather than duplicating them:

**VPS · .env settings**

``` text
COMPOSE_PROJECT_NAME=nextcloud-dev
PROTOCOL=http
DOMAIN_SUFFIX=.test
IP_BIND=127.0.0.1
PROXY_PORT_HTTP=8080
PROXY_PORT_HTTPS=8443
NEXTCLOUD_AUTOINSTALL_APPS="viewer profiler hmr_enabler"
```

Install the core first. Build the Groupware apps before enabling them. Create a shared Docker network and save [nextcloud.override.yml](examples/nextcloud.override.yml) as `/srv/nextcloud-dev/docker-compose.override.yml`.

**VPS · terminal**

``` bash
docker network create nc-dev-access
cd /srv/nextcloud-dev
docker compose config --quiet
docker compose up -d nextcloud
docker compose exec --user www-data nextcloud php occ status
```

Wait for installation to finish. Then follow each app's source-build instructions. The checkouts live under `/srv/nextcloud-dev/workspace/server/apps-extra/`.

- [Calendar](https://github.com/nextcloud/calendar#readme)
- [Contacts](https://github.com/nextcloud/contacts#readme)
- [Mail](https://github.com/nextcloud/mail#readme)
- [Deck](https://github.com/nextcloud/deck#readme)
- [Talk](https://github.com/nextcloud/spreed#readme)

Match each repository's Node and package-manager requirements. If OpenClaw's `NODE_ENV=production` omits frontend build tools, use the app's documented development install, such as `npm ci --include=dev`. Keep app PHP test dependencies separate from the running server where they conflict with server classes. A package-lock mismatch needs investigation; do not silently rewrite it.

**VPS · terminal**

``` bash
cd /srv/nextcloud-dev
docker compose exec --user www-data nextcloud php occ app:enable calendar contacts mail deck spreed
docker compose exec --user www-data nextcloud php occ app:list
docker compose exec --user www-data nextcloud php occ config:system:set trusted_domains 10 --value=nextcloud.test
curl --max-time 10 -I -H "Host: nextcloud.test" http://127.0.0.1:8080/
```

For local Chrome access, add `127.0.0.1 nextcloud.test` to your Mac's `/etc/hosts`, then tunnel port 8080:

**Mac · terminal**

``` bash
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8080:127.0.0.1:8080 root@203.0.113.10
```

Open `http://nextcloud.test:8080`. Upstream uses development credentials such as `admin / admin`. Keep this instance private and use test data only.

> The original bot wrote custom helpers named `bin/nc-dev`, `bin/update-latest`, and `bin/capture-screenshot.cjs`. The chat exports do not contain their source. They are not upstream commands and this tutorial does not claim to ship them.

## 6. Give OpenClaw access to the dev stack

Docker resolves bind-mount source paths on the VPS, even when the command comes from another container. Mount the development directory at the same absolute path on both sides. This avoids the empty-checkout problem from the original setup.

> Access to `/var/run/docker.sock` gives the bot effective root control over this VPS. Use a dedicated development host and trusted users. A read-only socket mount does not make Docker API operations read-only.

Read the socket's group ID. Do not assume it is `989`:

**VPS · terminal**

``` bash
stat -c '%g' /var/run/docker.sock
```

Add `DOCKER_GID=THE_NUMBER_YOU_JUST_READ` to `/opt/openclaw/.env`. Save [openclaw.override.yml](examples/openclaw.override.yml) as `/opt/openclaw/docker-compose.override.yml`. If you already have an override, merge these settings into it.

**VPS · docker-compose.override.yml**

``` yaml
services:
  openclaw-gateway:
    ports: !override
      - "127.0.0.1:18789:18789"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /srv/nextcloud-dev:/srv/nextcloud-dev
      - ./gh-state:/home/node/.config/gh
    environment:
      GIT_CONFIG_GLOBAL: /home/node/.openclaw/gitconfig
    group_add:
      - "${DOCKER_GID:?Set DOCKER_GID in .env}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - default
      - dev-access
networks:
  dev-access:
    external: true
    name: nc-dev-access
```

For this fresh development checkout, make the files writable by the image's node user. First verify its UID and GID:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway id
```

If the result is UID 1000 and primary GID 1000, run the following. If your image differs, use the actual values. The recursive ownership change is only for this dedicated development directory.

**VPS · terminal**

``` bash
chown -R 1000:1000 /srv/nextcloud-dev
install -d -m 700 -o 1000 -g 1000 /opt/openclaw/gh-state
cd /opt/openclaw
docker compose config --quiet && docker compose up -d --no-build --force-recreate openclaw-gateway
docker compose exec openclaw-gateway id
docker compose exec openclaw-gateway docker ps
docker compose exec openclaw-gateway getent hosts nextcloud.test
docker compose exec -w /srv/nextcloud-dev openclaw-gateway docker compose ps
```

Run future source-control operations as that same user through the gateway. The bot can now use `http://nextcloud.test` on the shared network. Keep the development Compose project on its existing default network too; its database and Redis use it.

Compose mounts, groups, networks, and image changes require recreation. `docker compose restart` alone does not apply them. See [Compose merge rules](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/) and [bind-mount paths](https://docs.docker.com/engine/storage/bind-mounts/).

## 7. Verify browser testing and screenshots

The browser image supplies Chromium. Enable a headless managed browser and allow access to the named development host:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js config set browser.enabled true
docker compose exec openclaw-gateway node dist/index.js config set browser.headless true
docker compose exec openclaw-gateway node dist/index.js config set browser.defaultProfile openclaw
docker compose exec openclaw-gateway node dist/index.js config set browser.ssrfPolicy.allowedHostnames '["nextcloud.test"]' --strict-json
docker compose exec openclaw-gateway node dist/index.js browser --browser-profile openclaw start
```

If Chromium reports a sandbox error in your container, consult the [Linux browser troubleshooting guide](https://docs.openclaw.ai/tools/browser/troubleshooting). Do not disable its sandbox unless that is necessary for your dedicated test environment. Keep browser debugging ports private.

**OpenClaw chat**

``` text
Open http://nextcloud.test in the managed openclaw browser. Log in with the development account. Verify that Calendar renders, then save a screenshot under your persistent workspace. Inspect the image and report its path. If login or rendering fails, report the actual error.
```

A browser that can start has not yet proved it can access the app. Confirm the authenticated page and inspect the saved image. For a PR, use the same test data and viewport before and after, rebuild the app, and refresh cached assets. The original run caught an incorrect "after" screenshot that still loaded the old JavaScript.

Reference: [browser configuration and private host access](https://docs.openclaw.ai/tools/browser/configuration).

## 8. Connect a GitHub bot account

Create a separate GitHub account you control, with recovery access and two-factor authentication. In OpenClaw, use the agent's GitHub connection flow if your version offers it. Authorize the bot account in your local browser. The original version exposed this under Settings, Agents, Tools, GitHub.

For a direct GitHub CLI login, run this inside the gateway and finish its browser/device flow:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway gh auth login --hostname github.com --git-protocol https --web
docker compose exec openclaw-gateway gh auth status
docker compose exec openclaw-gateway gh api user --jq .login
docker compose exec openclaw-gateway gh auth setup-git
```

Use one credential owner consistently. A dashboard-managed credential may be injected only into agent runs; a plain shell can have different authentication. Verify identity and push access from the same execution context that will handle GitHub work. The override from step 6 persists CLI credentials in `/opt/openclaw/gh-state` and Git configuration inside the OpenClaw state directory. Keep both private.

Set a Git author name and verified or GitHub no-reply email inside the bot's environment with `git config --global user.name` and `git config --global user.email`. Use a fork for contributions to upstream repositories. Follow each project's contribution and DCO requirements, including `git commit -s` when required.

References: [GitHub CLI login](https://cli.github.com/manual/gh_auth_login), [Git credential setup](https://cli.github.com/manual/gh_auth_setup-git), and [Nextcloud contribution guidance](https://github.com/nextcloud/server/blob/master/.github/CONTRIBUTING.md).

## 9. Handle GitHub mentions by polling

Connecting GitHub does not turn mentions into commands. The original setup tried a custom webhook bridge, then replaced it with notification polling because the bot could not administer upstream webhooks.

Polling needs no inbound GitHub endpoint. Keep the dashboard behind its client certificate. The custom poller implementation was not included in the exports, so the block below is a setup request with acceptance criteria, not an installer for an existing plugin.

Create `GITHUB_COMMAND_ALLOWLIST.md` in the agent's persistent workspace. Start with your own GitHub login:

**Workspace · Markdown file**

``` text
# Allowed GitHub command authors

- YOUR_GITHUB_LOGIN
```

**OpenClaw chat**

``` text
Set up a GitHub notification check every five minutes for @YOUR_BOT.

Only act on explicit mentions from users in GITHUB_COMMAND_ALLOWLIST.md and repositories in nextcloud/*. Match usernames and the exact owner name case-insensitively. Do not accept similarly named owners. Start with a baseline that skips old notifications.

Read all notification pages and inspect the actual comment author and text. A notification is only a hint. Use thread ID plus updated_at to detect changes, and persist handled comment IDs to avoid repeated replies. New mentions in an already-seen thread must still work. Ignore deleted comments and the bot's own messages.

Prevent overlapping runs. Record a completed reply before marking the notification read. Handle retries without blindly posting twice. Keep state in persistent storage. Use a lightweight check when the installed scheduler supports it; otherwise explain the model cost of each scheduled run.

Load the Nextcloud development workflow in every isolated run. Use /srv/nextcloud-dev and http://nextcloud.test. Acknowledge accepted mentions with an eyes reaction, then respond after doing the requested work. Do not merge or deploy.

Show me the schedule, state location, authorization checks, and a dry-run result before enabling outbound replies.
```

Temporarily add a repository you control to the allowed repository list for testing. Send an allowed mention, repeat the check, then send a second mention in the same issue. You should see one reply per accepted comment. Also test an unlisted author and an out-of-scope repository. Both must produce no action. Remove the temporary test repository afterward if it should not remain authorized.

GitHub supports a fixed set of reactions. Use `eyes` for acknowledgement; the elephant emoji is not a supported GitHub reaction. It can still be used in Talk.

References: [OpenClaw automations](https://docs.openclaw.ai/automation/cron-jobs), [GitHub notifications](https://docs.github.com/en/rest/activity/notifications), and [GitHub reactions](https://docs.github.com/en/rest/reactions/reactions).

### If you prefer webhooks

You need an implementation that validates GitHub's HMAC signature, event type, author, repository, mention, and duplicate deliveries. You also need repository or organization permission to register the webhook. An OAuth connection alone does not grant that permission. Expose only the signed webhook route on a separate HTTPS endpoint; GitHub cannot use your personal browser client certificate. The custom bridge from the chats is not aable package in this guide.

See [creating webhooks](https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks) and [signature verification](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries).

## 10. Connect the development Talk instance

This step uses the private development instance. First build and enable Talk. Both containers share `nc-dev-access`, so the webhook can stay inside Docker.

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js plugins install @openclaw/nextcloud-talk
docker compose restart --timeout 30 openclaw-gateway
```

Generate a shared secret on the VPS and read it without adding its literal value to shell history:

**VPS · terminal**

``` bash
openssl rand -hex 32
read -rsp "Paste the generated Talk secret: " TALK_SECRET
printf "\n"
cd /srv/nextcloud-dev
docker compose exec --user www-data nextcloud php occ config:system:set allow_local_remote_servers --type=boolean --value=true
docker compose exec --user www-data nextcloud php occ talk:bot:install "OpenClaw" "$TALK_SECRET" "http://openclaw-gateway:8788/nextcloud-talk-webhook" --feature webhook --feature response --feature reaction
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js channels add --channel nextcloud-talk --base-url http://nextcloud.test --secret "$TALK_SECRET"
unset TALK_SECRET
```

Local-server access is enabled only on this private test instance. The shared secret must match at both ends. Configure the private base URL and webhook location:

**VPS · terminal**

``` bash
docker compose exec openclaw-gateway node dist/index.js config set channels.nextcloud-talk.network.dangerouslyAllowPrivateNetwork true
docker compose exec openclaw-gateway node dist/index.js config set channels.nextcloud-talk.webhookPublicUrl http://openclaw-gateway:8788/nextcloud-talk-webhook
```

In Talk, add the bot to a room. In OpenClaw, bind the Talk channel to the `nextcloud-bot` agent, using the dashboard or the [channel routing instructions](https://docs.openclaw.ai/channels/channel-routing). Configure the channel's API user and app password through OpenClaw's setup UI. Use a Nextcloud account that belongs to that room; an inaccessible room may return 404. The API password is a Nextcloud app password, not the shared bot secret.

For the original "answer everyone without a mention" behavior:

**VPS · terminal**

``` bash
docker compose exec openclaw-gateway node dist/index.js config set channels.nextcloud-talk.groupAllowFrom '["*"]' --strict-json
docker compose exec openclaw-gateway node dist/index.js config set channels.nextcloud-talk.rooms '{"*":{"enabled":true,"requireMention":false}}' --strict-json
docker compose restart --timeout 30 openclaw-gateway
docker compose exec openclaw-gateway node dist/index.js channels status --probe
```

> Wildcard access means every member of a room containing the bot can address it. With Docker access enabled, use only trusted development rooms. For a shared deployment, use explicit room and sender allowlists.

Send a real Talk message and confirm a reply. An unsigned curl request only tests reachability. It does not prove the secret, room access, or response feature works.

**OpenClaw chat**

``` text
On Nextcloud Talk, acknowledge each accepted message with one fitting reaction before working on the reply. Use 🐘 when no other reaction fits. Save this preference in USER.md.
```

See the [OpenClaw Talk reference](https://docs.openclaw.ai/channels/nextcloud-talk) and [Nextcloud Talk bot documentation](https://nextcloud-talk.readthedocs.io/en/latest/bots/). For an existing external Talk server, use its HTTPS base URL and a separate reachable, signed webhook endpoint. Its installation is outside this tutorial.

## 11. Use keyword memory without embeddings

The original bot could chat through OAuth but failed to rebuild memory because its embedding API account had no credit. A model login does not establish a funded embeddings configuration.

For a demo, full-text search avoids embedding requests. These keys match the current memory schema and the original successful repair. Use your actual agent ID:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose exec openclaw-gateway node dist/index.js config set agents.entries.nextcloud-bot.memory.search.provider none
docker compose exec openclaw-gateway node dist/index.js config set agents.entries.nextcloud-bot.memory.search.fallback none
docker compose restart --timeout 30 openclaw-gateway
docker compose exec openclaw-gateway node dist/index.js memory status --index --agent nextcloud-bot
```

Look for all files indexed, `Dirty: no`, and `FTS: ready`. "Embeddings unavailable" is expected in this mode. Keyword search remains available; semantic similarity search does not. Do not delete the agent database to repair an index because it also stores other agent state.

Reference: [memory configuration](https://docs.openclaw.ai/reference/memory-config).

## 12. Save the development workflow

Isolated jobs need the same environment instructions as your main chat. Add [this workflow template](templates/nextcloud-dev-workflow.md) to the agent's persistent workspace instructions and reference it explicitly in every GitHub automation.

**Workspace · workflow template**

``` text
For every GitHub-originated Nextcloud task:
1. Read the development workflow before probing for checkouts.
2. Use /srv/nextcloud-dev. The app repositories are in workspace/server/apps-extra.
3. Inspect Git status and the current branch. Never overwrite uncommitted work or switch away from another active task.
4. Before baseline testing, update only clean default-branch checkouts with fast-forward-only pulls. Refresh server submodules and rebuild changed apps using their documented tool versions. Record the tested commits.
5. For a PR, check out the requested revision deliberately. Do not replace it with latest main during verification.
6. Check Compose services, occ status, and occ app:list before claiming the environment is missing.
7. Use http://nextcloud.test in the managed browser. Seed test data when a reproduction needs it.
8. Capture and inspect before/after screenshots with the same viewport and data. Refresh browser assets after rebuilding.
9. Run the relevant app checks, then report what passed and what remains unverified.
10. Clean up only your own fixtures and restore the prior branch when safe.
```

The transcript contains a useful failure case. A poller searched only three directories deep, missed the Contacts checkout, and posted a false blocker. A written path and service checks would have prevented it.

You can also ask for a daily issue digest:

**OpenClaw chat**

``` text
Create a daily report at 09:00 Europe/Budapest for new issues in nextcloud/mail, nextcloud/contacts, and nextcloud/calendar. Exclude pull requests. Deliver it to this Talk room and record the room token explicitly.

Use the interval since the last successful report, with a clear time range. Include per-app counts, issue titles, and links. Use severity labels only when the issue labels or description justify them; otherwise say untriaged. Keep the report readable and add a short section about issues that need attention.

Show the schedule and destination, then run one delivery test. Avoid creating another job if an equivalent one already exists.
```

Choose your own timezone. The original session used 09:00 UTC, which is not always 09:00 local time. Inspect the scheduler's run history and confirm a real Talk delivery before relying on the schedule.

## When something fails

| Symptom | Next check |
|----|----|
| Docker socket permission denied | Compare `id` inside the gateway with `stat -c '%g' /var/run/docker.sock` on the host. Apply `group_add` with recreation. |
| Tools vanished after recreation | Build them into the image. Keep credentials and browser profiles in persistent mounts. |
| 502 from Caddy | Test `http://127.0.0.1:18789/healthz` on the VPS. If that fails too, inspect the gateway before changing certificates. |
| Gateway is draining for restart | Restart the OpenClaw container and confirm its uptime resets. A hanging internal restart is different from a completed container restart. |
| Proxy attribution required | Find the immediate proxy peer in gateway logs. Set a narrow `gateway.trustedProxies` entry and retain Caddy's forwarded-header handling. |
| Talk ignores room messages | Check sender allowlists, room settings, and mention requirements. Confirm the bot is enabled in that room. |
| Talk returns 404 or 401 | Check API-user room membership, app password, matching bot secret, and the bot's `response` feature. |
| A second GitHub mention is ignored | A thread ID is reused. Track notification versions and handled comment IDs, not just the thread ID. |
| Browser cannot find the test instance | Check shared-network DNS, trusted domains, and browser private-host policy. Laptop localhost and container localhost are different. |
| Shell reports a date or prompt as a command | Copy only the code block. Do not paste logs, Markdown link syntax, or `root@server#`. |

Run these on the VPS for a gateway failure:

**VPS · terminal**

``` bash
cd /opt/openclaw
docker compose ps -a
docker compose logs --since=10m --tail=100 openclaw-gateway
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q openclaw-gateway)"
curl --max-time 10 -I http://127.0.0.1:18789/healthz
```

If logs show a stalled restart, restart the container. This interrupts running bot tasks:

**VPS · terminal**

``` bash
docker compose restart --timeout 30 openclaw-gateway
docker compose ps
docker compose logs --since=2m --tail=60 openclaw-gateway
```

For Compose changes, use `docker compose up -d --no-build --force-recreate openclaw-gateway` instead. Never use `down -v` as a routine repair; it removes volumes.

## Check the complete flow

- \[ \] The gateway becomes healthy after a restart.
- \[ \] The dashboard works through SSH or the client-certificate domain.
- \[ \] If using the domain, requests without a client certificate fail.
- \[ \] GitHub identity and Git push credentials use the intended bot account.
- \[ \] Docker access and the shared development path survive recreation.
- \[ \] Nextcloud and the selected apps pass their setup checks.
- \[ \] The bot opens an authenticated app page and saves an inspected screenshot.
- \[ \] A Talk message receives one acknowledgement and a reply.
- \[ \] Two mentions in the same GitHub thread each work without duplicate replies.
- \[ \] An unapproved GitHub author cannot trigger work.
- \[ \] The daily report reaches the chosen room at the intended timezone.
- \[ \] Memory reports a clean full-text index.

The original chats reported successful Talk replies, a daily digest, authenticated Calendar screenshots, and a Contacts before/after reproduction. They also exposed configuration and workflow mistakes. This guide incorporates those lessons without publishing the chat transcripts or their credentials.
