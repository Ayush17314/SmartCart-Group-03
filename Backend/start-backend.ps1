# SmartCart Backend Runner
$services = @(
    "auth-service",
    "product-service",
    "cart-service",
    "wishlist-service",
    "order-service",
    "payment-service",
    "notification-service",
    "api-gateway"
)

$backendDir = $PSScriptRoot
$logDir = Join-Path $backendDir ".run-logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

Write-Host "Starting SmartCart backend services..." -ForegroundColor Cyan

foreach ($svc in $services) {
    $svcPath = Join-Path $backendDir $svc
    $outFile = Join-Path $logDir "$svc.out.log"
    $errFile = Join-Path $logDir "$svc.err.log"

    Start-Process -FilePath "node" `
        -ArgumentList "src/server.js" `
        -WorkingDirectory $svcPath `
        -RedirectStandardOutput $outFile `
        -RedirectStandardError $errFile `
        -WindowStyle Hidden

    Write-Host "  -> Started $svc" -ForegroundColor Green
}

Start-Sleep -Seconds 3

Write-Host "`nChecking service health endpoints:" -ForegroundColor Cyan
4000..4007 | ForEach-Object {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:$_/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "  Port $_ : Healthy" -ForegroundColor Green
    } catch {
        Write-Host "  Port $_ : Starting up or error" -ForegroundColor Yellow
    }
}

Write-Host "`nAll backend services launched! API Gateway is at http://localhost:4000" -ForegroundColor Cyan
Write-Host "Swagger API Documentation: http://localhost:4000/docs" -ForegroundColor Cyan
