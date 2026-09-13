---
name: Baileys package firewall
description: Environment-specific dependency installation behavior for the WhatsApp Baileys project.
---

The imported pinned Baileys release can be rejected by Replit's package firewall, while the latest safe release is installable.

**Why:** The initial dependency install was blocked by a critical-CVE security policy, but installing the latest Baileys release allowed the project workflow to start.

**How to apply:** Use the package-management recovery flow and try the latest Baileys release before considering any other dependency or code change. Never bypass the package firewall.