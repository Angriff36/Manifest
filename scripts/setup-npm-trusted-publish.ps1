# One-time: link @angriff36/manifest to GitHub Actions cut-release.yml (OIDC).
# Requires npm login + passkey approval when prompted.
$ErrorActionPreference = 'Stop'
Remove-Item Env:NPM_CONFIG_USERCONFIG -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Linking npm trusted publisher for cut-release.yml ..."
Write-Host "When prompted, press Enter and approve with your passkey in the browser."
Write-Host ""

npx -y npm@11.15.0 trust github @angriff36/manifest `
  --file cut-release.yml `
  --repository Angriff36/Manifest `
  --allow-publish `
  -y

Write-Host ""
Write-Host "Done. cut-release.yml can publish to npm without NPM_TOKEN."
Write-Host "Optional: delete the NPM_TOKEN secret on GitHub if it is still a GitHub PAT."
