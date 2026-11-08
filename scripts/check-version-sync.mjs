import { readFile } from 'node:fs/promises'

const rootPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const studioPackage = JSON.parse(
  await readFile(new URL('../apps/studio/package.json', import.meta.url), 'utf8'),
)
const contractsPackage = JSON.parse(
  await readFile(new URL('../packages/contracts/package.json', import.meta.url), 'utf8'),
)
const utilsPackage = JSON.parse(
  await readFile(new URL('../packages/utils/package.json', import.meta.url), 'utf8'),
)
const manifest = JSON.parse(
  await readFile(new URL('../.release-please-manifest.json', import.meta.url), 'utf8'),
)
const versionFile = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim()
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8')
const version = rootPackage.version
const releaseHeading = changelog.match(/^## v(\d+\.\d+\.\d+) - .+$/m)?.[1]

const versions = {
  root: version,
  studio: studioPackage.version,
  contracts: contractsPackage.version,
  utils: utilsPackage.version,
  'release-please': manifest['.'],
  VERSION: versionFile.startsWith('v') ? versionFile.slice(1) : versionFile,
}
const mismatches = Object.entries(versions).filter(([, value]) => value !== version)

if (mismatches.length) {
  for (const [name, value] of mismatches) {
    console.error(`${name} version ${value || '(missing)'} does not match ${version}.`)
  }
  process.exitCode = 1
} else if (releaseHeading && releaseHeading !== version) {
  console.error(`Latest changelog release ${releaseHeading} does not match ${version}.`)
  process.exitCode = 1
} else {
  console.log(`All project version sources match ${version}.`)
}
