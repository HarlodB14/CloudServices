# Score Service

Dedicated microservice for Photo Prestige scoring.

## Responsibilities
- Analyze target/submission images via AI provider (`imagga` or `google-vision`)
- Compute `visualSimilarity`, `timingScore`, and `finalScore`
- Persist score records and provide leaderboard queries
- Finalize ranking per target

## Endpoints
- `GET /health`
- `POST /scores/targets/analyze` (internal, requires `x-service-key`)
- `POST /scores/evaluations` (internal, requires `x-service-key`)
- `GET /scores/targets/:targetId/leaderboard`
- `GET /scores/targets/:targetId/participants/:participantId`
- `POST /scores/targets/:targetId/finalize` (internal, requires `x-service-key`)

## Formula
Default weighted formula:
- Similarity weight: `0.7`
- Timing weight: `0.3`
- `finalScore = round(similarity * 0.7 + timingScore * 0.3)`

Weights are configurable with env vars and normalized automatically.
