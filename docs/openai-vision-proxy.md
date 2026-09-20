# OpenAI Vision proxy

The app tries `/api/openai-vision` before using a browser-stored fallback key.
Production deployments should provide `OPENAI_API_KEY` as a server-side secret so label images can be processed without exposing the key to the browser.
