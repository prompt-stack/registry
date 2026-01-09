# Pre-installed Tools by Platform

Reference document for determining which tools come pre-installed on each operating system.

## macOS (Monterey 12+, Ventura 13+, Sonoma 14+)

### Always Pre-installed
- `bash` - Shell ✓
- `curl` - HTTP client ✓
- `grep` - Text search ✓
- `sed` - Stream editor ✓
- `awk` - Text processor ✓
- `git` - Version control ✓ (optional, but very common from Xcode)
- `sqlite3` - Database CLI ✓
- `zsh` - Default shell (Catalina+)

### Usually Pre-installed
- `python3` - Python interpreter ✓ (varies by version)
- `perl` - Perl interpreter ✓
- `ruby` - Ruby interpreter ✓
- `node` - Node.js - ✗ (NOT pre-installed, some Homebrew installs)
- `npm` - Node package manager - ✗ (NOT pre-installed)

### Development Tools (XCode Command Line)
- `gcc` / `clang` - C compiler
- `make` - Build tool
- `git` - If XCode installed
- Install with: `xcode-select --install`

### NOT Pre-installed (Requires Download/Install)
- `ffmpeg` - Video processing
- `imagemagick` / `magick` - Image processing
- `tesseract` - OCR
- `pandoc` - Document converter
- `jq` - JSON processor
- `yq` - YAML processor
- `rg` (ripgrep) - Fast grep
- `wrangler` - Cloudflare CLI
- `docker` - Container runtime
- `kubectl` - Kubernetes CLI
- `vercel` - Vercel CLI
- `netlify` - Netlify CLI
- And most other development tools

### Homebrew-Available (Can Use brew install)
- Most tools listed in "NOT Pre-installed" above
- Common: `brew install ffmpeg`, `brew install imagemagick`, `brew install jq`

## Linux (Ubuntu 22.04 LTS / Debian 12)

### Always Pre-installed (Base System)
- `bash` - Shell ✓
- `curl` - HTTP client ✓
- `grep` - Text search ✓
- `sed` - Stream editor ✓
- `awk` - Text processor ✓
- `python3` - Python interpreter ✓

### Usually Pre-installed
- `git` - Version control ✓ (common on development systems)
- `sqlite3` - Database CLI ✓ (often included)
- `perl` - Perl interpreter ✓

### NOT Pre-installed (apt install required)
- `node` - Node.js - ✗ (requires `apt install nodejs`)
- `npm` - Node package manager - ✗ (requires `apt install npm`)
- `ffmpeg` - Video processing (requires `apt install ffmpeg`)
- `imagemagick` - Image processing (requires `apt install imagemagick`)
- `tesseract` - OCR (requires `apt install tesseract-ocr`)
- `jq` - JSON processor (requires `apt install jq`)
- `docker` - Container runtime (requires setup)
- `postgresql` - Database server (requires `apt install postgresql`)
- And most development tools

### Desktop Linux (GNOME, KDE)
- Additional pre-installed: Various utilities
- Varies by distribution and installation type

## Windows 11 / Windows 10

### Almost Nothing Pre-installed (Development Perspective)

#### Command Shell
- `cmd.exe` - Command prompt ✓
- `powershell.exe` - PowerShell ✓

#### System Tools Only
- `curl.exe` - Windows 10 Build 17063+ ✓ (limited)
- `tar.exe` - Windows 10 Build 17063+ ✓

### NOT Pre-installed (Absolutely Requires Install)
- `git` - Version control ✗
- `node` - Node.js ✗
- `npm` - Node package manager ✗
- `python` - Python interpreter ✗
- `ffmpeg` - Video processing ✗
- `sqlite3` - Database CLI ✗
- `docker` - Container runtime ✗
- `wsl` - Windows Subsystem for Linux ✗
- Visual C++ redistributables ✗
- Build tools ✗

### Package Managers (Optional Install)
- **Chocolatey** - Popular but not pre-installed
- **Windows Package Manager (winget)** - Pre-installed on some Windows 11 versions
- **Scoop** - Popular community package manager, not pre-installed
- **WSL2** - Can run Linux inside Windows

### Installation Methods on Windows
1. Direct download/installer
2. Chocolatey: `choco install git`
3. Scoop: `scoop install git`
4. WSL2: `wsl apt install git`
5. RUDI: `rudi install binary:git`

## Summary Table

| Tool | macOS | Linux | Windows |
|------|-------|-------|---------|
| **bash** | ✓ | ✓ | ✗ (PowerShell) |
| **curl** | ✓ | ✓ | ✓ (Windows 10+) |
| **git** | ✓ | ✓ | ✗ |
| **python3** | ✓ | ✓ | ✗ |
| **node** | ✗ | ✗ | ✗ |
| **sqlite3** | ✓ | ✓ | ✗ |
| **ffmpeg** | ✗ | ✗ | ✗ |
| **imagemagick** | ✗ | ✗ | ✗ |
| **jq** | ✗ | ✗ | ✗ |
| **docker** | ✗ | ✗ | ✗ |
| **postgresql** | ✗ | ✗ | ✗ |

## Notes for Manifest Authors

### When to Use "system" Strategy
- ✅ If tool is in the summary table above with ✓
- ✅ Only mark as system on specific platforms where it's pre-installed
- ❌ Don't assume tools are pre-installed without verification

### When to Use "bundled" Strategy
- ✅ Tools marked as ✗ in summary table (anything with ✗ on a platform)
- ✅ Tools with version-specific requirements (Python 3.11 specifically, not "python3")
- ✅ Tools needed for consistency/reproducibility

### When to Use "package-manager" Strategy
- ✅ Linux: If tool is easily available via apt
- ✅ macOS: If tool is commonly available via Homebrew
- ❌ Windows: Very limited package manager adoption, prefer bundled

### Platform-Specific Recommendations

**macOS:**
```
git: optional-bundled (system preferred, RUDI available)
sqlite3: system (always available)
ffmpeg: external-download (evermeet.cx) or bundled
python3: bundled (specific versions like 3.11)
node: bundled (no pre-installed versions)
```

**Linux (Ubuntu/Debian):**
```
git: package-manager OR optional-bundled (apt install git)
sqlite3: package-manager (sudo apt install sqlite3)
python3: system (built-in, but bundle for specific versions)
ffmpeg: bundled (apt version may be outdated)
node: bundled (RUDI for consistency, not apt for old versions)
```

**Windows:**
```
git: bundled (must provide binary)
sqlite3: bundled (must provide binary)
python3: bundled (must provide binary)
ffmpeg: bundled (must provide binary)
node: bundled (must provide binary)
```

## Verification Commands

### Check what's installed

**macOS/Linux:**
```bash
# Check if tool exists
which git
command -v git
# Check version
git --version
```

**Windows (PowerShell):**
```powershell
Get-Command git
git --version
```

### Verify pre-installed Python

**macOS/Linux:**
```bash
# Check if python3 exists
which python3
python3 --version

# Common location
ls -la /usr/bin/python*
```

**Windows:**
```powershell
# Should return "not found"
python --version
python3 --version
```

### Check Homebrew (macOS)

```bash
# List installed packages
brew list
# Check if formula exists
brew search ffmpeg
```

### Check apt (Linux)

```bash
# Check if package is available
apt-cache search sqlite3
# Check if installed
dpkg -l | grep sqlite3
```

## RUDI Binary Manifest Status

Current binaries in registry and their recommended strategies:

| Binary | darwin | linux | win32 | Notes |
|--------|--------|-------|-------|-------|
| git | optional-bundled | package-manager | bundled | Pre-installed on macOS/Linux |
| sqlite3 | system | package-manager | bundled | Pre-installed on Unix-like |
| ffmpeg | external-download | bundled | bundled | Never pre-installed |
| python | bundled | bundled | bundled | Version-specific for all platforms |
| node | bundled | bundled | bundled | Never pre-installed |
| jq | bundled | bundled | bundled | Never pre-installed |
| imagemagick | external-download | bundled | bundled | Rarely pre-installed |
| tesseract | bundled | bundled | bundled | Never pre-installed |
| pandoc | bundled | bundled | bundled | Never pre-installed |
| yq | bundled | bundled | bundled | Never pre-installed |
| curl | system | system | system | Pre-installed on all modern systems |
| docker | bundled | bundled | bundled | Requires separate setup |
| postgresql | package-manager | package-manager | bundled | Usually package-managed on Unix |
| wrangler | bundled | bundled | bundled | Only via npm |
| vercel | bundled | bundled | bundled | Only via npm |
| netlify | bundled | bundled | bundled | Only via npm |
| flyio | bundled | bundled | bundled | Only via npm |
| railway | bundled | bundled | bundled | Only via npm |
| supabase | bundled | bundled | bundled | Only via npm |

## Updates Needed

As RUDI registry is updated:
- Run verification commands on actual systems
- Test shim fallback behavior
- Verify agent can make correct installation decisions
- Update this document as platform changes occur
