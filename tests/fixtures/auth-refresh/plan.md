# auth-refresh: rotate refresh tokens

## Intent

Stolen refresh tokens stay valid for 30 days (issue #212). Rotate the token on
every refresh and refuse a token that was already used, signing out the
whole family.

## Done when

- A refresh returns a new token; the old one then gets 401 reuse
- A reused token revokes every token of its family
- The web app signs out on 401 reuse, and nowhere else

## Out of scope

Access-token lifetime; the admin session list.

## Decisions for you

1. Grace period for a token used twice? Options: none / 10 s.
   **Recommended: 10 s**, else two open tabs sign the user out.

## How the work is split

`api` and `store` share nothing and run at once. `web` waits for `api`
because it needs the new error code.

```yaml
troupe: 1
goal: "Refresh tokens rotate on every use, and a reused one is refused"
why: "Stolen refresh tokens stay valid for 30 days today (issue #212)"
workflow: troupe-mission
base: main
profiles:
  claude-build:
    agent: claude
    model: opus
    effort: high
    flags: [--permission-mode, acceptEdits]
roles:
  api:
    agent: codex
    model: gpt-6.1-sol
    effort: high
    flags: [-a, on-request, -s, workspace-write]
    goal: "Rotate the token on refresh; refuse a reused one with 401 reuse"
    touches: [src/api/refresh.ts, src/api/errors.ts]
  store:
    use: claude-build
    goal: "Keep a token family and a used flag per token"
    touches: [src/store/, migrations/]
  web:
    use: claude-build
    model: sonnet
    effort: medium
    goal: "Sign the user out when a refresh is refused"
    touches: [web/src/session/]
    depends_on: [api]
  review:
    use: claude-build
    model: sonnet
    goal: "Review each branch as it lands"
    touches: []
    reviews: [api, store, web]
```

## Role: api

Issue a new token on each refresh and mark the old one used.

## Role: store

Keep a token family and a used flag per token.

## Role: web

Sign the user out on 401 reuse.

## Role: review

Review store, api and web as each lands.
