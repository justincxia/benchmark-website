# HuggingFace Docker Space. Needs the persistent-storage add-on (mounted at /data) and the
# Space variable DATABASE_PATH=/data/arena.db. Upload the stimuli to /data/audio with the
# tts-sts-audio layout (e.g. by running `npm run copy-audio` locally and uploading data/audio).
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
RUN mkdir -p /app/data && chown user:user /app/data
USER user
# Stimuli are not in the image; like the database they live on the persistent volume.
ENV AUDIO_DIR=/data/audio
ENV DATABASE_PATH=/data/arena.db
EXPOSE 7860
# Refuse to start without stimuli, seed if empty (a no-op on a populated database), then serve.
CMD ["sh", "-c", "node scripts/check-audio.ts && node scripts/seed.ts && npx next start -p 7860"]
