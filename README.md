# SpineSight XR Lite

A mobile-first, English-language 2D posture observation prototype. React and MediaPipe guide a rear-camera photo; a local FastAPI service independently detects the landmarks and calculates image geometry. DeepSeek explains the structured results on request.

This educational prototype does not diagnose or rule out scoliosis, measure Cobb angle, reconstruct the spine, or recommend treatment.

## Start on this Mac

Dependencies and model assets have been installed in this checkout.

Double-click **Start SpineSight.command**, or run from the project directory:

```sh
python3 scripts/dev.py
```

Open **http://localhost:5173**. Keep the terminal running; Ctrl+C stops both servers. If port 5173 or 8000 is already in use, use the existing app or stop its terminal first.

The DeepSeek key belongs in `backend/.env` only. It is ignored by Git and is never bundled into the frontend. Restart the backend after changing this file.

## Set up a fresh checkout

Requirements: Python 3.11, Node.js 22.12+ (or a compatible supported LTS), npm, and an internet connection for dependency/model downloads.

```sh
python3.11 scripts/setup.py
python3 scripts/dev.py
```

Windows PowerShell:

```powershell
py -3.11 scripts/setup.py
py -3.11 scripts/dev.py
```

Setup creates `backend/.venv`, installs the locked Python and npm dependencies, copies the frontend WASM assets, verifies both model copies, and creates missing `.env` files without overwriting existing ones. Python dependencies are pinned in `backend/requirements.lock.txt`; npm uses `frontend/package-lock.json`.

Backend settings are documented in `backend/.env.example`:

```dotenv
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

The model identifier was checked against the [official DeepSeek API documentation](https://api-docs.deepseek.com/) on 2026-11-15. It remains configurable. A missing key leaves CV analysis available and returns a clear error for AI features.

## Phone camera over HTTPS

The phone's browser needs a trusted HTTPS origin. A plain computer LAN IP over HTTP will not enable camera access.

1. Keep `python3 scripts/dev.py` running.
2. Build the current frontend:
   ```sh
   cd frontend
   npm run build
   cd ..
   ```
3. Ensure `cloudflared` is installed (`brew install cloudflared` on macOS; already installed on this Mac).
4. Run:
   ```sh
   python3 scripts/phone.py
   ```
5. Open the printed `https://…trycloudflare.com` address on your phone. Enter username `observer` and the random password printed in that terminal.
6. Accept the in-app notice, allow camera access, and follow the capture instructions. Use the countdown when standing with your back to the phone.

The phone helper serves the built frontend and proxies `/api` through a password gate on loopback port 5180. The public HTTPS tunnel reaches only that gate; FastAPI stays bound to `127.0.0.1:8000`. The password is generated in memory and never embedded in a URL or saved. Ctrl+C closes the gateway and tunnel. Rebuild after frontend changes. An account-free Quick Tunnel is for temporary demos and may be unavailable on some networks; use a protected named tunnel if your network requires it.

Topology: phone → HTTPS tunnel → password gate/built frontend → local FastAPI.

The installed cloudflared version does not support the newer `--allowed-mail` flag, so the helper uses its own password gate. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Features

- Consent, capture instructions, camera, preview/retake, results, and separate assistant pages.
- Live browser MediaPipe guidance, optional speech, mute, and countdown; camera/model resources released on exit.
- Optional photo upload for desktop use; decoded image quality is still checked by the backend.
- Real backend pose inference with four shoulder/hip landmarks; SVG overlay uses backend coordinates.
- Five geometric measurements, aspect-ratio correction, signed angles, and expandable technical details.
- Explicitly requested AI report and chat; no automatic paid calls. An existing report remains in session memory.
- Report output capped at 1,000 tokens; chat at 500; thinking disabled and at most one format repair. Chat sends at most eight recent messages.
- Clear errors and retry; an AI failure preserves the visual analysis.

## Data handling

- No accounts, database, persistent photos, or history.
- Photos are decoded in memory, never written by the application to a temporary upload file, and never sent to DeepSeek.
- Only structured analysis is cached in backend memory for 30 minutes (bounded capacity); restart clears it.
- Photo preview, reports, consent, and chat live in browser memory for the current session.
- AI requests send measurements/observation labels and, for chat, recent messages. Provider-side retention is governed by DeepSeek's terms; the app does not promise zero retention by third parties.
- Upload limit: 8 MiB; decoded image limit: 20 megapixels and 8192 pixels per side. Supported still formats: JPEG, PNG, WebP.

## Verify

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
cd ../frontend
npm run typecheck
npm test
npm run build
cd ..
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Windows: use `.venv\Scripts\python.exe` for backend commands.

The real-model positive test accepts `SPINESIGHT_TEST_POSE_IMAGE=/absolute/path/to/photo.jpg`; without a supplied image it is explicitly skipped. Synthetic tests are deterministic and LLM tests mock HTTP, so they do not spend API tokens. See `docs/VERIFICATION.md` for checks actually completed and remaining real-phone checks.

## Troubleshooting

- **Camera unavailable:** use localhost on this computer or the phone HTTPS URL; allow camera access. Close another app using the camera.
- **Model unavailable:** run `python3 scripts/download_model.py` and restart. The script validates the pinned checksum rather than accepting an empty or changed model.
- **AI unavailable:** check backend configuration, account balance, and network; restart after `.env` changes. The visual analysis remains usable.
- **Session expired:** capture/upload again. The 30-minute cache and all frontend state are intentionally temporary.
- **Tunnel unreachable:** keep both terminals open, confirm the local app works, then restart the tunnel. Its address changes on each run.

## Project references

- [Product specification](docs/PROJECT_SPEC.md)
- [API contract](docs/API_CONTRACT.md)
- [Original milestone plan](docs/CODEX_TASKS.md)
- [Model provenance and checksum](docs/MODEL_ASSETS.md)
- [Verification record](docs/VERIFICATION.md)

Implementation clarification: API coordinates remain normalized, but all geometric calculations restore the original width/height scale. Shoulder/hip angles are wrapped to `[-90, 90)`; positive means downward toward screen right. Positive torso lean means the shoulder midpoint is toward screen right of the hip midpoint. Anatomical left/right height descriptions are determined separately.
