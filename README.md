# Mission Control (PWA)

Phone client for driving a fleet of Claude Code sessions running in tmux on your Mac.

This is the **frontend only** — a static, installable PWA. It holds **no secrets**:
on first launch you enter your backend URL (Tailscale / Cloudflare tunnel / localhost)
and an access token, stored in `localStorage`. The backend (control plane) runs on
your Mac from `~/.mission-control`.

Live: open this Pages URL on your phone → Add to Home Screen → enter backend + token.
