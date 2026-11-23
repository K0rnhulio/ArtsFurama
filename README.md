# Furama Custom Art Portal

Simple WebApp for Furama Resort Da Nang to upload high-resolution guest photos, attach notes, generate Order IDs (`FUR-YYMM-XXXX`), and track/share progress (`Uploaded` → `In Design` → `In Production` → `Delivered`).

## Local Development

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploying on Coolify

- **Build Pack**: Dockerfile (included)
- **Port**: `3000`
- **Persistent Storage (Important!)**: Mount two persistent volumes in Coolify so orders and uploaded photos survive redeployments:
  - `/app/data` (SQLite database)
  - `/app/uploads` (Original high-res photos & designer previews)
