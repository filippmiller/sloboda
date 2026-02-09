# SLOBODA Forum System - Complete Implementation Script
# Run this PowerShell script to complete the forum implementation

Write-Host "=== SLOBODA Forum System Implementation ===" -ForegroundColor Green
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path ".\server\db.js")) {
    Write-Host "ERROR: Please run this script from the project root directory (C:\dev\derevnya)" -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Installing backend dependencies..." -ForegroundColor Yellow
cd server
npm install
cd ..

Write-Host "[2/5] Installing frontend dependencies..." -ForegroundColor Yellow
cd client
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-image @tiptap/extension-code-block-lowlight lowlight date-fns
cd ..

Write-Host "[3/5] Running database migrations..." -ForegroundColor Yellow
$env:PGPASSWORD = $env:DATABASE_URL
# Extract connection details from DATABASE_URL
if ($env:DATABASE_URL -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
    psql -h $Matches[3] -p $Matches[4] -U $Matches[1] -d $Matches[5] -f "server\migrations\add-forum-system.sql"
    Write-Host "Database migrations completed!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Could not parse DATABASE_URL. Please run migrations manually:" -ForegroundColor Yellow
    Write-Host "  psql `$DATABASE_URL < server\migrations\add-forum-system.sql" -ForegroundColor Yellow
}

Write-Host "[4/5] Building frontend..." -ForegroundColor Yellow
cd client
npm run build
cd ..

Write-Host "[5/5] Testing server startup..." -ForegroundColor Yellow
Write-Host "Starting server (Ctrl+C to stop)..." -ForegroundColor Cyan
cd server
npm run dev

Write-Host ""
Write-Host "=== Implementation Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Server should now be running on http://localhost:3001" -ForegroundColor White
Write-Host "  2. Visit http://localhost:3001/forum to see the forum" -ForegroundColor White
Write-Host "  3. Create a test user and start posting!" -ForegroundColor White
Write-Host ""
Write-Host "Manual steps still needed:" -ForegroundColor Yellow
Write-Host "  - Create remaining route files (see continuation message)" -ForegroundColor White
Write-Host "  - Create frontend components (React)" -ForegroundColor White
Write-Host ""
