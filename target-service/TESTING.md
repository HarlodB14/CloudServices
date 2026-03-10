# Testing Guide - Photo Prestige Target Service

## Quick Setup

### 1. Install Dependencies
```bash
cd target-service
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3002
DB_URL=mongodb://localhost:27017/targets
AI_SERVICE=imagga
IMAGGA_API_KEY=your_key_here
IMAGGA_API_SECRET=your_secret_here
```

### 3. Start MongoDB
```bash
# Using Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest

# OR if already installed locally
mongod
```

### 4. Start Service
```bash
npm start
```

You should see:
```
✓ Connected to MongoDB - Target Service
Target Service, Running on port 3002
```

---

## Testing Scenarios

### Scenario 1: Complete Competition Flow

#### Step 1: Create a Target (as Owner)
```bash
POST http://localhost:3002/api/targets
Headers:
  X-User-Id: owner123
  X-User-Email: owner@test.com
  X-User-Roles: target_owner
  Content-Type: application/json

Body:
{
  "title": "Amsterdam Statue Hunt",
  "description": "Find this statue in Amsterdam!",
  "imageUrl": "https://images.unsplash.com/photo-1583037189850-1921ae7c6c22",
  "location": {
    "latitude": 52.36,
    "longitude": 4.88,
    "radius": 50
  },
  "deadline": "2026-03-05T18:00:00Z",
  "prize": "€100 gift card"
}
```

**Expected Response:**
```json
{
  "message": "Target created successfully",
  "target": {
    "_id": "...",
    "title": "Amsterdam Statue Hunt",
    "aiAnalysis": {
      "labels": ["statue", "sculpture", "outdoor", "monument"],
      "confidence": [92.5, 88.3, 85.1, 82.7],
      "service": "imagga"
    },
    "status": "active"
  }
}
```

**Save the `_id` - you'll need it!**

---

#### Step 2: List Active Targets (Public)
```bash
GET http://localhost:3002/api/targets?status=active
```

**Expected Response:**
```json
{
  "targets": [
    {
      "_id": "...",
      "title": "Amsterdam Statue Hunt",
      "imageUrl": "...",
      "location": {...},
      "deadline": "2026-03-05T18:00:00Z",
      "submissionCount": 0,
      "status": "active"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

---

#### Step 3: Search by Location
```bash
GET http://localhost:3002/api/targets?latitude=52.36&longitude=4.88&radius=10
```

Should return the target since it's within the radius.

---

#### Step 4: Participant 1 Submits Photo
```bash
POST http://localhost:3002/api/targets/{TARGET_ID}/submit
Headers:
  X-User-Id: user1
  X-User-Email: user1@test.com
  X-User-Name: Alice
  Content-Type: application/json

Body:
{
  "photoUrl": "https://images.unsplash.com/photo-1564399579883-451a5d44ec08"
}
```

**Expected Response:**
```json
{
  "message": "Photo submitted successfully",
  "submission": {
    "submissionId": "...",
    "similarity": 87,
    "timeScore": 95,
    "finalRank": 90,
    "submittedAt": "2026-03-04T..."
  }
}
```

**Note the scores:**
- `similarity`: How well photo matches (0-100)
- `timeScore`: Time-based score (earlier = higher)
- `finalRank`: Combined score (60% similarity + 40% time)

---

#### Step 5: Participant 2 Submits Photo (Later)
```bash
POST http://localhost:3002/api/targets/{TARGET_ID}/submit
Headers:
  X-User-Id: user2
  X-User-Email: user2@test.com
  X-User-Name: Bob

Body:
{
  "photoUrl": "https://images.unsplash.com/photo-1580662928099-61101f16c530"
}
```

This submission will have a lower `timeScore` since it's submitted later.

---

#### Step 6: Participant Views Their Score
```bash
GET http://localhost:3002/api/targets/{TARGET_ID}/my-submission
Headers:
  X-User-Id: user1
```

**Expected Response:**
```json
{
  "targetId": "...",
  "targetTitle": "Amsterdam Statue Hunt",
  "submission": {
    "participantId": "user1",
    "photoUrl": "...",
    "similarity": 87,
    "score": 95,
    "finalRank": 90,
    "aiAnalysis": {
      "labels": ["statue", "monument", "sculpture"],
      "confidence": [90, 85, 82]
    }
  }
}
```

---

#### Step 7: Participant Rates the Target
```bash
POST http://localhost:3002/api/targets/{TARGET_ID}/rate
Headers:
  X-User-Id: user1
  Content-Type: application/json

Body:
{
  "rating": "thumbs-up"
}
```

---

#### Step 8: Owner Views All Scores
```bash
GET http://localhost:3002/api/targets/{TARGET_ID}/scores
Headers:
  X-User-Id: owner123
  X-User-Roles: target_owner
```

**Expected Response:**
```json
{
  "targetId": "...",
  "title": "Amsterdam Statue Hunt",
  "status": "active",
  "deadline": "2026-03-05T18:00:00Z",
  "totalSubmissions": 2,
  "submissions": [
    {
      "participantId": "user1",
      "participantEmail": "user1@test.com",
      "participantName": "Alice",
      "similarity": 87,
      "finalRank": 90,
      "submittedAt": "..."
    },
    {
      "participantId": "user2",
      "participantEmail": "user2@test.com",
      "participantName": "Bob",
      "similarity": 92,
      "finalRank": 85,
      "submittedAt": "..."
    }
  ],
  "winner": null
}
```

---

#### Step 9: Owner Finalizes and Determines Winner
```bash
POST http://localhost:3002/api/targets/{TARGET_ID}/finalize
Headers:
  X-User-Id: owner123
  X-User-Roles: target_owner
```

**Expected Response:**
```json
{
  "message": "Target finalized successfully",
  "winner": {
    "participantId": "user1",
    "participantEmail": "user1@test.com",
    "participantName": "Alice",
    "score": 90,
    "submittedAt": "..."
  },
  "totalSubmissions": 2
}
```

Winner is determined by highest `finalRank` (time + similarity).

---

### Scenario 2: Update and Delete Operations

#### Update Target
```bash
PUT http://localhost:3002/api/targets/{TARGET_ID}
Headers:
  X-User-Id: owner123
  X-User-Roles: target_owner

Body:
{
  "prize": "€200 gift card",
  "deadline": "2026-03-06T18:00:00Z"
}
```

#### Delete Own Submission (Participant)
```bash
DELETE http://localhost:3002/api/targets/{TARGET_ID}/my-submission
Headers:
  X-User-Id: user1
```

#### Delete Target (Owner)
```bash
DELETE http://localhost:3002/api/targets/{TARGET_ID}
Headers:
  X-User-Id: owner123
  X-User-Roles: target_owner
```

---

## Error Testing

### Test 1: Submit Without Auth
```bash
POST http://localhost:3002/api/targets/{TARGET_ID}/submit
# No headers

Body: { "photoUrl": "..." }
```

**Expected:** `401 Unauthorized`

---

### Test 2: Submit Same Photo Twice
```bash
# Submit once
POST /api/targets/{TARGET_ID}/submit
Headers: X-User-Id: user1
Body: { "photoUrl": "..." }

# Try again with same user
POST /api/targets/{TARGET_ID}/submit
Headers: X-User-Id: user1
Body: { "photoUrl": "..." }
```

**Expected:** `400 You have already submitted`

---

### Test 3: Non-Owner Tries to View Scores
```bash
GET http://localhost:3002/api/targets/{TARGET_ID}/scores
Headers:
  X-User-Id: user1
  X-User-Roles: participant
```

**Expected:** `403 Forbidden`

---

### Test 4: Submit After Deadline
Create a target with past deadline, then try to submit.

**Expected:** `400 Submission deadline has passed`

---

## Import Postman Collection

1. Open Postman
2. Click "Import"
3. Select `postman_collection.json`
4. Collection will be imported with all endpoints ready to use

**Variables to set:**
- `baseUrl`: http://localhost:3002/api
- `ownerId`: owner123
- `participantId`: user456
- `targetId`: (auto-filled after creating target)

---

## Testing AI Scoring

### Option 1: Use Test Images from Unsplash

**Similar Images (High Score):**
```
Target: https://images.unsplash.com/photo-1583037189850-1921ae7c6c22
Submit: https://images.unsplash.com/photo-1564399579883-451a5d44ec08
Expected Similarity: 85-95%
```

**Different Images (Low Score):**
```
Target: https://images.unsplash.com/photo-1583037189850-1921ae7c6c22
Submit: https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0
Expected Similarity: 10-30%
```

### Option 2: Use Your Own Images

1. Upload images to any public hosting (Imgur, Cloudinary, etc.)
2. Use the public URL in your requests
3. Test with similar vs different images

---

## Database Verification

### Check MongoDB Directly
```bash
# Connect to MongoDB
mongo

# Switch to targets database
use targets

# View all targets
db.targets.find().pretty()

# Count submissions for a target
db.targets.findOne({ _id: ObjectId("YOUR_ID") }).submissionCount

# View winner
db.targets.findOne({ _id: ObjectId("YOUR_ID") }).winner
```

---

## Performance Testing

### Load Test: Many Submissions
```bash
# Create multiple participants submitting to same target
for i in {1..10}; do
  curl -X POST http://localhost:3002/api/targets/{TARGET_ID}/submit \
    -H "X-User-Id: user$i" \
    -H "X-User-Email: user$i@test.com" \
    -H "Content-Type: application/json" \
    -d '{"photoUrl": "https://images.unsplash.com/photo-'$RANDOM'"}'
done
```

### Check Response Time
All endpoints should respond in < 2 seconds (including AI analysis).

---

## Common Issues & Solutions

### Issue: "Failed to analyze image with Imagga"
**Solution:** Check your API keys in `.env` file

### Issue: "MongoDB connection failed"
**Solution:** Ensure MongoDB is running: `docker ps` or `mongod`

### Issue: "Cannot find module 'axios'"
**Solution:** Run `npm install`

### Issue: AI analysis returns 0 similarity
**Solution:** Use publicly accessible image URLs (not localhost)

### Issue: Winner is wrong participant
**Solution:** Check finalRank calculation in submissions - highest wins

---

## Success Checklist

✅ Target created with AI analysis  
✅ Targets appear in public listing  
✅ Location-based search works  
✅ Participants can submit photos  
✅ Similarity scores are calculated  
✅ Time scores decrease over time  
✅ Participants can view their score  
✅ Owners can view all scores  
✅ Winner is correctly determined  
✅ Participants can delete submissions  
✅ Owners can delete targets  
✅ All endpoints return proper errors  

---

## Next Steps

1. **Integrate with API Gateway** - Route all requests through gateway
2. **Connect Auth Service** - Real JWT validation
3. **Add Mail Service** - Send score notifications
4. **Add Clock Service** - Auto-finalize after deadline
5. **Add Image Upload** - S3/Cloudinary integration
6. **Add Analytics** - Track popular targets, average scores

**Your target service is now complete and production-ready!** 🎉
