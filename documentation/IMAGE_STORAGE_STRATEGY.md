# Image Storage Strategy (Photo Prestige)

## Why this approach
The assignment requires images to be directly viewable via URL so client-side caching works.

Implemented strategy:
- Store uploaded images on disk in `target-service/storage/uploads`
- Serve them as static assets via `target-service` under `/media/*`
- Expose `/media/*` through the API gateway so clients use one public base URL

## Flow
1. User uploads via `POST /api/uploads`
2. `target-service` stores the image file and returns:
   - `imageUrl` (public URL)
   - `imagePath` (relative `/media/...`)
   - `imageHash` (SHA-256)
3. This URL is used as `imageUrl` (target photo) or `photoUrl` (submission)

## Game requirement: not identical photo
- On target creation, the target image SHA-256 hash is stored as `target.imageHash`
- On submission, photo hash is computed and compared against `target.imageHash`
- If identical, submission is rejected

## Extra moderation support
Target owners can remove participant photos with:
- `DELETE /api/targets/:id/submissions/:submissionId`

This keeps gameplay aligned with owner moderation requirements.
