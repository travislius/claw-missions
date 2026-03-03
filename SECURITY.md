# Security Guide

OctoCloud is designed to store personal and sensitive files. This guide explains the built-in security measures and recommended deployment practices.

---

## Built-in Security

### Authentication
- All API endpoints require a valid JWT token or API key
- Passwords are hashed with **bcrypt** (never stored in plain text)
- JWT tokens expire after **24 hours** by default (configurable)

### Login Rate Limiting
- Max **5 failed login attempts** per IP address per 5 minutes
- Exceeding the limit returns `429 Too Many Requests`
- Counter resets on successful login
- Protects against brute-force attacks

### CORS Lockdown
- API only accepts requests from origins defined in `OCTOCLOUD_ALLOWED_ORIGINS`
- Prevents other websites from making requests to your vault on behalf of visitors
- Set this to your exact deployment URL (e.g. `https://cloud.yourdomain.com`)

### JWT Secret
- Generate a strong secret with `openssl rand -hex 32`
- Never use the default `changeme` value in production
- Store it in your `.env` file (never commit `.env` to git)

---

## Recommended: Cloudflare Access (Zero Trust)

OctoCloud has no built-in two-factor authentication. We strongly recommend putting it behind **Cloudflare Access** (free tier), which adds an email-based verification gate *before* the login page is reachable.

### How it works
```
Visitor → Cloudflare Access gate
            ↓ (email OTP verification)
          OctoCloud login page
            ↓ (username + password)
          Your files ✅
```

Even if someone knows your password, they cannot reach the login page without verifying via your email first.

### Setup (5 minutes)
1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
2. **Access → Applications → Add an application → Self-hosted**
3. Set domain to your OctoCloud URL (e.g. `cloud.yourdomain.com`)
4. Add a policy: **Allow → Emails → your@email.com**
5. Set session duration to **30 days** (so you only verify once per device)
6. Save — done

### Session Cookie
Once verified on a device, Cloudflare sets a cookie lasting up to 30 days. You won't be prompted again until the cookie expires or you clear your browser data.

---

## Other Options

If you're not using Cloudflare, consider:

| Option | Description |
|--------|-------------|
| **Nginx basic auth** | Add HTTP Basic Auth in front of OctoCloud |
| **VPN-only** | Restrict port to a VPN (WireGuard, Tailscale) |
| **IP allowlist** | Cloudflare firewall rules to allow only your IPs |

---

## Environment Variables

| Variable | Description | Recommendation |
|----------|-------------|----------------|
| `OCTOCLOUD_PASSWORD` | Admin password | Use a strong, unique password |
| `OCTOCLOUD_SECRET` | JWT signing secret | Generate with `openssl rand -hex 32` |
| `OCTOCLOUD_ALLOWED_ORIGINS` | CORS allowed origins | Set to your exact deployment URL |

---

## What OctoCloud Does NOT Provide

- Two-factor authentication (use Cloudflare Access instead)
- File encryption at rest (files are stored as-is on disk)
- Audit logs (planned for a future release)

---

## Reporting Security Issues

Please open a GitHub issue tagged `security` or contact the maintainer directly.
