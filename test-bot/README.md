# Baileys Interactive Test Bot

A small, isolated test bot for the repository's `Test` branch. It does not import or modify the production MIS features.

## What it tests

- WhatsApp login using a phone-number pairing code (not QR).
- Persistent multi-file session credentials in `test-auth/`.
- Reconnection after temporary connection loss.
- Native-flow quick-reply buttons.
- A native-flow single-select list.
- Incoming interactive responses (`interactiveResponseMessage`) plus legacy button/list response parsing as compatibility fallbacks.

## Run

1. From the repository root, install dependencies:

   ```bash
   npm install
   ```

2. Copy `test-bot/.env.example` to `.env` in the repository root and set `PHONE_NUMBER` with country code and digits only.

3. Start the test bot:

   ```bash
   node test-bot/index.js
   ```

4. Copy the pairing code printed in the terminal. On the WhatsApp account being linked, open **Linked devices → Link a device → Link with phone number**, then enter the code.

5. From another WhatsApp account, message the linked account with `menu`. Tap Daily or Booking, or open More options and select Cash, Reports, or Help.

## Notes

- Keep `.env` and `test-auth/` private. Do not commit credentials.
- To pair a different account, stop the bot and remove the `test-auth/` directory before restarting.
- Baileys is an unofficial WhatsApp Web client. Interactive message rendering can vary by WhatsApp client and server-side compatibility. A successful send call does not guarantee every client renders native controls. Test on the actual Android/iOS clients you intend to support.
- This is a compatibility test, not a production login service. Do not use it for bulk messaging.
