# SmartCart Backend Stopper
Write-Host "Stopping all running SmartCart backend services (ports 4000-4007)..." -ForegroundColor Cyan

4000..4007 | ForEach-Object {
    $conns = Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        foreach ($conn in $conns) {
            try {
                Stop-Process -Id $conn.OwningProcess -Force -ErrorAction Stop
                Write-Host "  -> Stopped process on port $_ (PID $($conn.OwningProcess))" -ForegroundColor Green
            } catch {
                Write-Host "  -> Could not stop PID $($conn.OwningProcess) on port $_" -ForegroundColor Red
            }
        }
    } else {
        Write-Host "  Port $_ : Already stopped" -ForegroundColor Gray
    }
}

Write-Host "All SmartCart backend services have been stopped." -ForegroundColor Cyan
