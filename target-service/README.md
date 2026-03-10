# Target Service API Documentation

## Overview
The Target Service manages photo scavenger hunt competitions (targets) where:
- **Target Owners** create competitions by uploading a target photo
- **Participants** submit their own photos trying to match the target
- **AI scoring** automatically calculates similarity between photos
- **Winner determination** combines similarity score + submission time

## Core Features

### 1. Target Management (CRUD for Owners)
- Create targets with photos, location, and deadline
- Update target details (title, description, prize, deadline)
- Delete owned targets
- View all submissions and scores for owned targets

### 2. Target Discovery (Public)
- List all active targets with pagination
- Filter by location (latitude, longitude, radius)
- Search by title or description
- Filter by status (active, closed, completed)

### 3. Participant Submissions
- Submit photos to targets
- View personal submission and score
- Delete own submission
- Rate targets (thumbs up/down)

### 4. AI-Powered Scoring
- Automatic image analysis using Imagga or Google Vision
- Similarity calculation based on image labels
- Combined score: 60% similarity + 40% time bonus

---

## API Endpoints

### Public Endpoints (No Authentication)

#### GET `/api/targets`
Get list of targets with filtering options.

**Query Parameters:**
- `latitude` (number): Filter by location latitude
- `longitude` (number): Filter by location longitude
- `radius` (number): Search radius in km (default: 10)
- `status` (string): Filter by status - 'active', 'closed', 'completed' (default: 'active')
- `search` (string): Search in title or description
- `limit` (number): Results per page (default: 50)
- `page` (number): Page number (default: 1)

**Response:**
```json
{
  "targets": [
    {
      "_id": "...",
      "title": "Rijksmuseum Statue",
      "description": "Find this statue in Amsterdam",
      "imageUrl": "https://...",
      "location": {
        "latitude": 52.36,
        "longitude": 4.88,
        "radius": 50
      },
      "deadline": "2026-03-04T13:00:00.000Z",
      "status": "active",
      "prize": "Year membership",
      "submissionCount": 42,
      "createdAt": "2026-03-04T12:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 50,
    "pages": 2
  }
}
```

#### GET `/api/targets/:id`
Get single target by ID with full details.

**Response:**
```json
{
  "_id": "...",
  "title": "Rijksmuseum Statue",
  "description": "...",
  "imageUrl": "https://...",
  "location": { "latitude": 52.36, "longitude": 4.88, "radius": 50 },
  "deadline": "2026-03-04T13:00:00.000Z",
  "status": "active",
  "submissionCount": 42,
  "winner": null
}
```

---

### Participant Endpoints (Require Authentication)

Authentication via headers (set by API Gateway):
- `X-User-Id`: User's unique ID
- `X-User-Email`: User's email
- `X-User-Name`: User's display name

#### POST `/api/targets/:id/submit`
Submit a photo for a target.

**Request Body:**
```json
{
  "photoUrl": "https://your-image-url.com/photo.jpg"
}
```

**Response:**
```json
{
  "message": "Photo submitted successfully",
  "submission": {
    "submissionId": "...",
    "similarity": 87,
    "timeScore": 95,
    "finalRank": 90,
    "submittedAt": "2026-03-04T12:30:00.000Z"
  }
}
```

**Scoring Logic:**
- `similarity`: 0-100 based on AI image analysis
- `timeScore`: 100 (submitted at start) to 0 (submitted at deadline)
- `finalRank`: (similarity × 0.6) + (timeScore × 0.4)

#### GET `/api/targets/:id/my-submission`
Get your submission for a target.

**Response:**
```json
{
  "targetId": "...",
  "targetTitle": "Rijksmuseum Statue",
  "submission": {
    "participantId": "...",
    "photoUrl": "https://...",
    "similarity": 87,
    "score": 95,
    "finalRank": 90,
    "submittedAt": "2026-03-04T12:30:00.000Z",
    "aiAnalysis": {
      "labels": ["statue", "sculpture", "monument", "outdoor"],
      "confidence": [92, 88, 85, 80]
    }
  }
}
```

#### DELETE `/api/targets/:id/my-submission`
Delete your submission (only before target is completed).

**Response:**
```json
{
  "message": "Submission deleted successfully"
}
```

#### POST `/api/targets/:id/rate`
Rate a target (thumbs up/down).

**Request Body:**
```json
{
  "rating": "thumbs-up"
}
```

**Values:** `"thumbs-up"` or `"thumbs-down"`

---

### Owner Endpoints (Require target_owner Role)

#### POST `/api/targets`
Create a new target.

**Request Body:**
```json
{
  "title": "Find the Bellende Engel",
  "description": "Find this angel statue at Sint-Janskathedraal",
  "imageUrl": "https://your-image.com/target.jpg",
  "location": {
    "latitude": 51.6902,
    "longitude": 5.3048,
    "radius": 50
  },
  "deadline": "2026-03-05T18:00:00.000Z",
  "prize": "€50 gift card"
}
```

**Response:**
```json
{
  "message": "Target created successfully",
  "target": {
    "_id": "...",
    "title": "...",
    "imageUrl": "...",
    "aiAnalysis": {
      "labels": ["angel", "statue", "church", "gothic"],
      "confidence": [95, 92, 88, 85],
      "service": "imagga"
    },
    "status": "active"
  }
}
```

#### PUT `/api/targets/:id`
Update your target (only title, description, prize, deadline).

**Request Body:**
```json
{
  "title": "Updated Title",
  "prize": "€100 gift card",
  "deadline": "2026-03-06T18:00:00.000Z"
}
```

#### DELETE `/api/targets/:id`
Delete your target.

#### GET `/api/targets/:id/scores`
View all submissions and scores for your target.

**Response:**
```json
{
  "targetId": "...",
  "title": "Rijksmuseum Statue",
  "status": "active",
  "deadline": "2026-03-04T13:00:00.000Z",
  "totalSubmissions": 42,
  "submissions": [
    {
      "participantId": "...",
      "participantEmail": "user@example.com",
      "participantName": "John Doe",
      "photoUrl": "https://...",
      "similarity": 92,
      "score": 88,
      "finalRank": 90,
      "submittedAt": "2026-03-04T12:15:00.000Z"
    }
  ],
  "winner": null
}
```

#### POST `/api/targets/:id/finalize`
Finalize target and determine winner (after deadline).

**Response:**
```json
{
  "message": "Target finalized successfully",
  "winner": {
    "participantId": "...",
    "participantEmail": "winner@example.com",
    "participantName": "Jane Smith",
    "score": 95,
    "submittedAt": "2026-03-04T12:05:00.000Z"
  },
  "totalSubmissions": 42
}
```

---

## Setup Instructions

### 1. Install Dependencies
```bash
cd target-service
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and configure:

```env
PORT=3002
DB_URL=mongodb://localhost:27017/targets

# Choose AI service: 'imagga' or 'google-vision'
AI_SERVICE=imagga

# Imagga (Free, no credit card)
IMAGGA_API_KEY=your_key
IMAGGA_API_SECRET=your_secret

# OR Google Vision (Requires credit card)
GOOGLE_VISION_API_KEY=your_key
```

### 3. Get Imagga API Credentials (Recommended)
1. Sign up at https://imagga.com
2. Free tier: 1000 requests/month, no credit card
3. Get API Key and Secret from dashboard

### 4. Run the Service
```bash
npm start
```

---

## Architecture

### Data Model
```javascript
Target {
  title, description, imageUrl
  ownerId, ownerEmail
  location: { latitude, longitude, radius }
  deadline, status: 'active'|'closed'|'completed'
  prize
  aiAnalysis: { labels[], confidence[], service }
  submissions: [{
    participantId, photoUrl
    similarity, score, finalRank
    submittedAt
    aiAnalysis: { labels[], confidence[] }
  }]
  winner: { participantId, score, submittedAt }
}
```

### Scoring Algorithm

**For each submission:**
1. **AI Analysis**: Analyze submitted photo using Imagga/Google Vision
2. **Similarity Score** (0-100):
   - Compare image labels between target and submission
   - Weight by confidence scores
   - Formula: 70% weighted match + 30% Jaccard similarity

3. **Time Score** (0-100):
   - `timeScore = (1 - timeElapsed/totalTime) × 100`
   - Earlier submissions get higher scores

4. **Final Rank**:
   - `finalRank = (similarity × 0.6) + (timeScore × 0.4)`

**Winner**: Highest finalRank after deadline

---

## Usage Examples

### Example: Create a Competition
```bash
POST /api/targets
Headers:
  X-User-Id: user123
  X-User-Email: owner@example.com
  X-User-Role: target_owner

Body:
{
  "title": "Sint-Jan Angel Hunt",
  "imageUrl": "https://example.com/angel.jpg",
  "location": {
    "latitude": 51.6902,
    "longitude": 5.3048,
    "radius": 100
  },
  "deadline": "2026-03-04T18:00:00Z",
  "prize": "€50"
}
```

### Example: Find Nearby Targets
```bash
GET /api/targets?latitude=51.69&longitude=5.30&radius=5&status=active
```

### Example: Submit Photo
```bash
POST /api/targets/TARGET_ID/submit
Headers:
  X-User-Id: participant456
  X-User-Email: user@example.com

Body:
{
  "photoUrl": "https://example.com/my-photo.jpg"
}
```

### Example: Finalize and Get Winner
```bash
POST /api/targets/TARGET_ID/finalize
Headers:
  X-User-Id: user123
  X-User-Role: target_owner
```

---

## Error Handling

Common error responses:

**400 Bad Request**
```json
{
  "error": "Missing required fields: title, imageUrl, location, deadline"
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden",
  "message": "You can only edit targets you own"
}
```

**404 Not Found**
```json
{
  "error": "Target not found"
}
```

**500 Server Error**
```json
{
  "error": "Server error: detailed message"
}
```

---

## Integration with Other Services

### Auth Service
Provides authentication and sets headers:
- `X-User-Id`
- `X-User-Email`
- `X-User-Role` (participant, target_owner, admin)

### Score Service (Future)
Can subscribe to submission events to maintain separate scoring database.

### Mail Service (Future)
- Send confirmation when target created
- Notify participants of their score
- Send deadline reminders
- Announce winner

### Clock Service (Future)
- Automatically finalize targets after deadline
- Send periodic reminders to non-submitters

---

## Assignment Requirements Checklist

✅ **As Participant:**
- Get overview of targets (location, coordinates filtering)
- Submit photo to target (not same photo)
- View my score on target
- Delete my submission

✅ **As Owner:**
- View scores of all participants
- Upload target with location
- Delete targets and participant photos
- Set deadline for submissions
- System determines winner based on (time + % match)

✅ **Core Services:**
- ✅ Target service - manages targets
- ⚠️ Auth service - (integrate with existing)
- ⚠️ Register service - (integrate with existing)
- ⚠️ Mail service - (to be implemented)
- ⚠️ Clock service - (to be implemented)
- ⚠️ Score service - (optional, can use target service)
- ✅ Read service - target listing with filters

---

## Testing with Postman

Import this collection or test manually:

### 1. Create Target (as owner)
```
POST http://localhost:3002/api/targets
Headers:
  X-User-Id: owner123
  X-User-Email: owner@test.com
  X-User-Role: target_owner
Body: { title, imageUrl, location, deadline, prize }
```

### 2. List Targets
```
GET http://localhost:3002/api/targets?status=active&limit=10
```

### 3. Submit Photo (as participant)
```
POST http://localhost:3002/api/targets/{targetId}/submit
Headers:
  X-User-Id: user456
  X-User-Email: user@test.com
Body: { photoUrl }
```

### 4. View My Submission
```
GET http://localhost:3002/api/targets/{targetId}/my-submission
Headers:
  X-User-Id: user456
```

### 5. View All Scores (as owner)
```
GET http://localhost:3002/api/targets/{targetId}/scores
Headers:
  X-User-Id: owner123
  X-User-Role: target_owner
```

### 6. Finalize Target
```
POST http://localhost:3002/api/targets/{targetId}/finalize
Headers:
  X-User-Id: owner123
  X-User-Role: target_owner
```
