# HuggingFace Docker Space. Data (survey trials, arena responses, accounts, recordings) lives in
# Supabase: set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (and optionally SUPABASE_RECORDINGS_BUCKET)
# as Space *secrets*. Seeding is a one-time `npm run seed` against Supabase, not done on boot.
# The stimuli still need the persistent-storage add-on (mounted at /data): upload them to
# /data/audio with the tts-sts-audio layout (e.g. `npm run copy-audio` locally, then upload).
FROM node:26-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-slim
WORKDIR /app
RUN useradd -m -u 1000 user
ENV NODE_ENV=production
COPY --from=builder --chown=user /app/package.json ./package.json
COPY --from=builder --chown=user /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=user /app/node_modules ./node_modules
COPY --from=builder --chown=user /app/.next ./.next
COPY --from=builder --chown=user /app/public ./public
COPY --from=builder --chown=user /app/lib ./lib
COPY --from=builder --chown=user /app/scripts ./scripts
COPY --from=builder --chown=user /app/seed ./seed
USER user
# Stimuli are not in the image; they live on the persistent volume.
ENV AUDIO_DIR=/data/audio
EXPOSE 7860
# Refuse to start without stimuli, then serve.
CMD ["sh", "-c", "node scripts/check-audio.ts && npx next start -p 7860"]
