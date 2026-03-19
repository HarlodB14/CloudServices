$ErrorActionPreference='Stop'
$base='http://localhost:3000'
$targetSourceUrl='https://httpbin.org/image/jpeg'
$participantSourceUrl='https://httpbin.org/image/png'

function PostJson($url,$body,$headers=@{}) {
  $json=$body|ConvertTo-Json -Depth 10
  Invoke-RestMethod -Method Post -Uri $url -Headers $headers -ContentType 'application/json' -Body $json
}

$ts=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ownerEmail="owner.smoke+$ts@example.com"
$participantEmail="participant.smoke+$ts@example.com"

Write-Host '[1] Health'
$health=Invoke-RestMethod -Method Get -Uri "$base/health"
Write-Host "  -> $($health.status)"

Write-Host '[2] Register owner'
$ownerReg=PostJson "$base/auth/register" @{ name='Smoke Owner'; email=$ownerEmail; registerAs='target_owner'; generateCredentials=$true }
$ownerPwd=$ownerReg.generatedCredentials.temporaryPassword

Write-Host '[3] Login owner'
$ownerLogin=PostJson "$base/auth/login" @{ email=$ownerEmail; password=$ownerPwd }
$ownerToken=$ownerLogin.token
$ownerHeaders=@{ Authorization = "Bearer $ownerToken" }

Write-Host '[4] Register participant'
$partReg=PostJson "$base/auth/register" @{ name='Smoke Participant'; email=$participantEmail; generateCredentials=$true }
$partPwd=$partReg.generatedCredentials.temporaryPassword

Write-Host '[5] Login participant'
$partLogin=PostJson "$base/auth/login" @{ email=$participantEmail; password=$partPwd }
$partToken=$partLogin.token
$partHeaders=@{ Authorization = "Bearer $partToken" }

Write-Host '[6] Owner upload target image'
$targetUpload=PostJson "$base/api/uploads" @{ imageUrl=$targetSourceUrl } $ownerHeaders
$targetImageUrl=$targetUpload.imageUrl
Write-Host "  -> $targetImageUrl"

Write-Host '[7] Participant upload candidate image'
$participantUpload=PostJson "$base/api/uploads" @{ imageUrl=$participantSourceUrl } $partHeaders
$participantImageUrl=$participantUpload.imageUrl
Write-Host "  -> $participantImageUrl"

$deadline=(Get-Date).ToUniversalTime().AddHours(2).ToString('o')
Write-Host '[8] Create target'
$target=PostJson "$base/api/targets" @{ title='Smoke Target Amsterdam'; description='Smoke flow'; locationDescription='Rijksmuseum square'; imageUrl=$targetImageUrl; location=@{ latitude=52.359997; longitude=4.885219; radius=100; city='Amsterdam'; placeName='Rijksmuseum' }; deadline=$deadline; prize='Smoke Prize' } $ownerHeaders
$targetId=$target.target._id
Write-Host "  -> targetId=$targetId"

Write-Host '[9] City filter'
$cityFilter=Invoke-RestMethod -Method Get -Uri "$base/api/targets?city=Amsterdam"
Write-Host "  -> returned $($cityFilter.targets.Count) targets"

Write-Host '[10] Participant register target'
$null=Invoke-RestMethod -Method Post -Uri "$base/api/register/$targetId" -Headers $partHeaders

Write-Host '[11] Identical submission should fail (400)'
$identicalStatus=0
try {
  $identicalBody=@{ photoUrl=$targetImageUrl }|ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$base/api/targets/$targetId/submit" -Headers $partHeaders -ContentType 'application/json' -Body $identicalBody | Out-Null
  $identicalStatus=200
} catch {
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $identicalStatus=[int]$_.Exception.Response.StatusCode
  } else {
    throw
  }
}
Write-Host "  -> status=$identicalStatus"
if ($identicalStatus -ne 400) { throw "Expected identical submission to return 400, got $identicalStatus" }

Write-Host '[12] Valid participant submission'
$submit=PostJson "$base/api/targets/$targetId/submit" @{ photoUrl=$participantImageUrl } $partHeaders
$submissionId=$submit.submission.submissionId
Write-Host "  -> submissionId=$submissionId"

Write-Host '[13] Owner moderation delete submission'
$delete=Invoke-RestMethod -Method Delete -Uri "$base/api/targets/$targetId/submissions/$submissionId" -Headers $ownerHeaders
Write-Host "  -> $($delete.message)"

Write-Host '[14] Owner scores after delete'
$scores=Invoke-RestMethod -Method Get -Uri "$base/api/targets/$targetId/scores" -Headers $ownerHeaders
Write-Host "  -> leaderboard entries: $($scores.submissions.Count)"

Write-Host 'SMOKE TEST RESULT: PASS'
