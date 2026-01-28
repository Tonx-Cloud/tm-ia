# TM-IA Pricing & Credits Test Suite
# Tests the new Pay-as-you-go system
# Usage: ./test-pricing.ps1

$BaseUrl = "http://localhost:3000/api"

function Test-Endpoint {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Body = $null,
        [string]$Description
    )

    Write-Host "TEST: $Description" -NoNewline
    
    try {
        $params = @{
            Uri = "$BaseUrl$Url"
            Method = $Method
            ContentType = "application/json"
        }
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 5)
        }

        $response = Invoke-RestMethod @params
        Write-Host " [OK]" -ForegroundColor Green
        return $response
    }
    catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "Error: $_"
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader $_.Exception.Response.GetResponseStream()
            Write-Host "Response: $($reader.ReadToEnd())"
        }
        return $null
    }
}

Write-Host "=== TM-IA PRICING SYSTEM TESTS ===" -ForegroundColor Cyan
Write-Host ""

# 1. List Packages
$packages = Test-Endpoint -Method GET -Url "/credits/packages" -Description "List Credit Packages"
if ($packages.packages.Count -gt 0) {
    Write-Host "   Found $($packages.packages.Count) packages" -ForegroundColor Gray
    $starter = $packages.packages | Where-Object { $_.id -eq 'starter' }
    Write-Host "   Starter Package: $($starter.credits) credits for `$$($starter.priceUSD)" -ForegroundColor Gray
}

# 2. Estimate Costs
Write-Host "`n--- Cost Estimation ---"
# 2a. Estimate Image Generation
$estGen = Test-Endpoint -Method POST -Url "/credits/estimate" -Body @{
    action = "GENERATE_IMAGE"
    quantity = 4
} -Description "Estimate: Generate 4 images"

if ($estGen.cost -eq 120) { # 4 * 30
    Write-Host "   Correct cost: 120 credits" -ForegroundColor Green
} else {
    Write-Host "   WRONG COST: Expected 120, got $($estGen.cost)" -ForegroundColor Red
}

# 2b. Estimate Render
$estRender = Test-Endpoint -Method POST -Url "/credits/estimate" -Body @{
    action = "render"
    renderConfig = @{
        newImages = 0
        animationSeconds = 10
        durationMinutes = 1.5
        quality = "hd"
        removeWatermark = $false
    }
} -Description "Estimate: Render (1.5min + 10s animation)"

# Calculation: 
# Animation: 10s * 50 = 500
# Render: ceil(1.5) * 100 = 200
# Total: 700
if ($estRender.cost -eq 700) {
    Write-Host "   Correct cost: 700 credits" -ForegroundColor Green
} else {
    Write-Host "   WRONG COST: Expected 700, got $($estRender.cost)" -ForegroundColor Red
}

# 3. Buy Credits
Write-Host "`n--- Purchase Flow ---"
$buy = Test-Endpoint -Method POST -Url "/credits/buy" -Body @{
    packageId = "starter"
    mock = $true
} -Description "Buy Starter Package (Mock)"

$currentBalance = $buy.balance
Write-Host "   Current Balance: $currentBalance" -ForegroundColor Yellow

# 4. Spending Flow
Write-Host "`n--- Spending Flow ---"

# 4a. Check Estimate for Generation
$imgCount = 2
$expectedCost = $imgCount * 30 # 60 credits

$preGen = Test-Endpoint -Method POST -Url "/credits/estimate" -Body @{
    action = "GENERATE_IMAGE"
    quantity = $imgCount
} -Description "Pre-check cost for $imgCount images"

if ($preGen.canAfford -eq $true) {
    Write-Host "   User can afford transaction" -ForegroundColor Green
}

# 4b. Execute Generation (this should deduct credits)
# Note: We need a valid prompt and mock mode usually requires auth. 
# Since we are running locally without valid auth token management in this simple script,
# we rely on the API recognizing the local environment or we need to implement login.
# For now, let's assume the previous tests worked which means auth is either mocked or not required for those endpoints.
# The 'assets/generate' endpoint requires a session.

Write-Host "   Skipping actual generation test (requires auth session setup)" -ForegroundColor DarkGray
# Ideally we would:
# 1. Login/Get Session
# 2. Call generate
# 3. Verify balance = oldBalance - 60

Write-Host "`n=== TESTS COMPLETED ===" -ForegroundColor Cyan
