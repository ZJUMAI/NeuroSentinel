# NeuroSentinel startup (Windows)
# Starts MinIO, ImageJ, Deep-Worm-Tracker, Neorual (optional), then pnpm run dev
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
# Docker commands may write warnings to stderr - avoid script termination
$dockerErrorAction = "SilentlyContinue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  NeuroSentinel Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Docker (use Start-Process to avoid stderr warnings triggering PowerShell errors)
Write-Host "[1/6] Checking Docker..." -ForegroundColor Yellow
$dockerOk = $false
for ($i = 1; $i -le 3; $i++) {
    $p = Start-Process -FilePath "docker" -ArgumentList "info" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
    if ($p -and $p.ExitCode -eq 0) { $dockerOk = $true; break }
    if ($i -lt 3) {
        Write-Host "  Docker not ready, retry in 2s... ($i/3)" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}
if (-not $dockerOk) {
    Write-Host "Error: Docker is not responding" -ForegroundColor Red
    Write-Host "  - Ensure Docker Desktop is fully started (wait 10-20s after opening)" -ForegroundColor Gray
    Write-Host "  - Try running 'docker info' in a new terminal to verify" -ForegroundColor Gray
    exit 1
}
Write-Host "  Docker OK" -ForegroundColor Green
Write-Host ""

# 2. Start MinIO (required for file upload - port 9000)
Write-Host "[2/6] Starting MinIO (ports 9000/9001)..." -ForegroundColor Yellow
$minioExists = $null
$minioRunning = $null
$ErrorActionPreference = $dockerErrorAction
try {
    $minioExists = docker ps -a --filter "name=manus-minio" --format "{{.Names}}" 2>$null
    $minioRunning = docker ps --filter "name=manus-minio" --format "{{.Names}}" 2>$null
} finally { $ErrorActionPreference = "Stop" }
if ($minioExists -eq "manus-minio") {
    if ($minioRunning -eq "manus-minio") {
        Write-Host "  MinIO already running" -ForegroundColor Green
    } else {
        $ErrorActionPreference = $dockerErrorAction
        docker start manus-minio 2>$null | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "  MinIO started" -ForegroundColor Green
    }
} else {
    $ErrorActionPreference = $dockerErrorAction
    docker run -d --name manus-minio -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin minio/minio server /data --console-address ":9001" 2>$null | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "  MinIO created and started" -ForegroundColor Green
    Write-Host "  Tip: Create bucket matching S3_BUCKET in .env (e.g. neurosentinel-uploads) at http://localhost:9001" -ForegroundColor Gray
}
Write-Host ""

# 3. Start ImageJ (optional - for image analysis, port 8000)
Write-Host "[3/6] Starting ImageJ (port 8000)..." -ForegroundColor Yellow
$imagejExists = $null
$imagejRunning = $null
$ErrorActionPreference = $dockerErrorAction
try {
    $imagejExists = docker ps -a --filter "name=imagej-agent" --format "{{.Names}}" 2>$null
    $imagejRunning = docker ps --filter "name=imagej-agent" --format "{{.Names}}" 2>$null
} finally { $ErrorActionPreference = "Stop" }
if ($imagejExists -eq "imagej-agent") {
    if ($imagejRunning -eq "imagej-agent") {
        Write-Host "  ImageJ already running" -ForegroundColor Green
    } else {
        $ErrorActionPreference = $dockerErrorAction
        docker start imagej-agent 2>$null | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "  ImageJ started" -ForegroundColor Green
    }
} else {
    $imageExists = docker images -q imagej-analysis-api 2>$null
    if (-not $imageExists) {
        Write-Host "  Building ImageJ image (first time may take a while)..." -ForegroundColor Gray
        Push-Location "$ProjectRoot\imagej-service"
        $ErrorActionPreference = $dockerErrorAction
        docker build -t imagej-analysis-api . 2>&1 | Out-Host
        $ErrorActionPreference = "Stop"
        Pop-Location
    }
    $ErrorActionPreference = $dockerErrorAction
    docker run -d -p 8000:8000 --name imagej-agent imagej-analysis-api 2>$null | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "  ImageJ created and started" -ForegroundColor Green
}
Write-Host ""

# 4. Start Deep-Worm-Tracker (optional, for video tracking, port 8001)
Write-Host "[4/6] Starting Deep-Worm-Tracker (port 8001)..." -ForegroundColor Yellow
$dwtExists = $null
$dwtRunning = $null
$ErrorActionPreference = $dockerErrorAction
try {
    $dwtExists = docker ps -a --filter "name=deep-worm-tracker" --format "{{.Names}}" 2>$null
    $dwtRunning = docker ps --filter "name=deep-worm-tracker" --format "{{.Names}}" 2>$null
} finally { $ErrorActionPreference = "Stop" }
if ($dwtExists -eq "deep-worm-tracker") {
    if ($dwtRunning -eq "deep-worm-tracker") {
        Write-Host "  Deep-Worm-Tracker already running" -ForegroundColor Green
    } else {
        $ErrorActionPreference = $dockerErrorAction
        docker start deep-worm-tracker 2>$null | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "  Deep-Worm-Tracker started" -ForegroundColor Green
    }
} else {
    $dwtImage = docker images -q deep-worm-tracker-api 2>$null
    if (-not $dwtImage) {
        Write-Host "  Building Deep-Worm-Tracker image (first time may take several minutes)..." -ForegroundColor Gray
        Push-Location "$ProjectRoot\deep-worm-tracker-service"
        $ErrorActionPreference = $dockerErrorAction
        docker build -t deep-worm-tracker-api . 2>&1 | Out-Host
        $ErrorActionPreference = "Stop"
        Pop-Location
    }
    $ErrorActionPreference = $dockerErrorAction
    docker run -d -p 8001:8001 --name deep-worm-tracker deep-worm-tracker-api 2>$null | Out-Null
    $ErrorActionPreference = "Stop"
    Write-Host "  Deep-Worm-Tracker created and started" -ForegroundColor Green
}
Write-Host ""

# 5. Start Neorual (optional - ViT/串珠/细胞体分析, port 8002)
Write-Host "[5/6] Starting Neorual (port 8002)..." -ForegroundColor Yellow
$neorualExists = $null
$neorualRunning = $null
$ErrorActionPreference = $dockerErrorAction
try {
    $neorualExists = docker ps -a --filter "name=neorual-agent" --format "{{.Names}}" 2>$null
    $neorualRunning = docker ps --filter "name=neorual-agent" --format "{{.Names}}" 2>$null
} finally { $ErrorActionPreference = "Stop" }
if ($neorualExists -eq "neorual-agent") {
    if ($neorualRunning -eq "neorual-agent") {
        Write-Host "  Neorual already running" -ForegroundColor Green
    } else {
        $ErrorActionPreference = $dockerErrorAction
        docker start neorual-agent 2>$null | Out-Null
        $ErrorActionPreference = "Stop"
        Write-Host "  Neorual started" -ForegroundColor Green
    }
} else {
    $neorualImage = docker images -q neorual-api 2>$null
    if (-not $neorualImage) {
        Write-Host "  Building Neorual image (first time may take 10-20 min)..." -ForegroundColor Gray
        Write-Host "  使用 --progress=plain 显示详细构建进度..." -ForegroundColor Gray
        Push-Location $ProjectRoot
        $ErrorActionPreference = $dockerErrorAction
        docker build --progress=plain -f neorual-service\Dockerfile -t neorual-api . 2>&1 | Out-Host
        $ErrorActionPreference = "Stop"
        Pop-Location
    }
    $modelPath = Join-Path $ProjectRoot "neorual-analysis\Model"
    $ErrorActionPreference = $dockerErrorAction
    if (Test-Path $modelPath) {
        docker run -d -p 8002:8002 -v "${modelPath}:/app/neorual-analysis/Model" --name neorual-agent neorual-api 2>$null | Out-Null
    } else {
        docker run -d -p 8002:8002 --name neorual-agent neorual-api 2>$null | Out-Null
    }
    $ErrorActionPreference = "Stop"
    Write-Host "  Neorual created and started" -ForegroundColor Green
    Write-Host "  Set NEORUAL_API_URL=http://localhost:8002 in .env to use" -ForegroundColor Gray
}
Write-Host ""

# 6. MySQL reminder
Write-Host "[6/6] Dependencies..." -ForegroundColor Yellow
Write-Host "  Ensure MySQL is running (port 3306) and DATABASE_URL in .env is correct" -ForegroundColor Gray
Write-Host ""

# 7. Start pnpm dev
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting dev server (pnpm run dev)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services:" -ForegroundColor White
Write-Host "  - App: http://localhost:3000" -ForegroundColor White
Write-Host "  - MinIO: http://localhost:9001 (bucket name = S3_BUCKET in .env)" -ForegroundColor White
Write-Host "  - ImageJ: http://localhost:8000" -ForegroundColor White
Write-Host "  - Deep-Worm-Tracker: http://localhost:8001" -ForegroundColor White
Write-Host "  - Neorual: http://localhost:8002 (set NEORUAL_API_URL in .env)" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

Set-Location $ProjectRoot
pnpm run dev
