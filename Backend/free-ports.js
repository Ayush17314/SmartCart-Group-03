const { execSync } = require("child_process");

const includeFrontend = process.argv.includes("--all") || process.argv.includes("--frontend");
const ports = includeFrontend
  ? [3000, 3001, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007]
  : [4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007];

if (process.platform === "win32") {
  try {
    const cmd = `powershell -NoProfile -Command "${ports.join(",")} | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique } | ForEach-Object { if ($_ -and $_ -ne ${process.pid}) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }"`;
    execSync(cmd, { stdio: "ignore" });
  } catch {}
} else {
  for (const port of ports) {
    try {
      execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: "ignore" });
    } catch {}
  }
}
