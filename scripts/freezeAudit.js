// Lists code files changed since the change-freeze baseline that are not
// recorded in any change record under docs/05-operations/agents/feature-updates/.
// Usage: npm run audit:freeze   (exit code 1 when unlogged changes exist)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

// Last commit before the freeze started (2026-10-10). Move it forward only when
// re-baselining after the freeze was OFF (see CHANGE_FREEZE_GUIDE.md §5).
const FREEZE_BASE = 'b977c7d';
const RECORDS_DIR = 'docs/05-operations/agents/feature-updates';
const CODE_PATHS = /^(src\/|supabase\/|scripts\/|public\/|package\.json$|index\.html$|vite\.config\.js$|capacitor\.config\.)/;

// The FREEZE switch in AGENTS.md also controls this audit and the pre-commit hook.
if (/\*\*FREEZE:\s*OFF\*\*/i.test(readFileSync('AGENTS.md', 'utf8'))) {
  console.log('Freeze audit skipped: AGENTS.md says FREEZE: OFF.');
  process.exit(0);
}

const git = command => execSync(`git ${command}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n').map(line => line.trim()).filter(Boolean);

const changed = new Set([
  ...git(`diff --name-only ${FREEZE_BASE}`),          // committed + uncommitted edits since the baseline
  ...git('ls-files --others --exclude-standard'),     // new files not yet added to git
].filter(file => CODE_PATHS.test(file)));

const records = readdirSync(RECORDS_DIR).filter(name => name.endsWith('.md') && name !== 'README.md');
const recorded = records.map(name => readFileSync(`${RECORDS_DIR}/${name}`, 'utf8')).join('\n');
const unlogged = [...changed].filter(file => !recorded.includes(`\`${file}\``)).sort();

console.log(`Freeze audit since ${FREEZE_BASE}: ${changed.size} code file(s) changed, ${changed.size - unlogged.length} recorded in ${records.length} change record(s).`);
if (!unlogged.length) {
  console.log('No unlogged changes.');
} else {
  console.log(`\n${unlogged.length} unlogged change(s). Add a change record in ${RECORDS_DIR}/ (see its README.md) or revert:`);
  for (const file of unlogged) {
    const [author] = git(`log -1 "--format=%an <%ae>" -- "${file}"`);
    console.log(`  - ${file}  (last commit by: ${author || 'not committed yet'})`);
  }
  process.exitCode = 1;
}
