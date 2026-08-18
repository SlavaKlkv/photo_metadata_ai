#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const DIRECT_PUSH_BRANCHES = new Set(['develop']);
const PR_MERGE_BRANCHES = new Set(['main']);

function getUpdateStrategy(branch) {
  if (DIRECT_PUSH_BRANCHES.has(branch)) {
    return 'direct';
  }
  if (PR_MERGE_BRANCHES.has(branch)) {
    return 'pull-request';
  }
  throw new Error(`Неизвестная ветка для обновления лендинга: ${branch}`);
}

function buildPrBranchName(version) {
  return `chore/landing-size-v${version}`;
}

function buildCommitMessage(version) {
  return `chore: update landing download size for v${version}`;
}

function runCommand(command, args, { allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 && !allowFailure) {
    const details = (result.stderr || result.stdout || '').trim();
    throw new Error(`${command} ${args.join(' ')} failed${details ? `: ${details}` : ''}`);
  }

  return {
    status: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function configureGitIdentity() {
  runCommand('git', ['config', 'user.name', 'github-actions[bot]']);
  runCommand('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
}

function checkoutBranch(branch, remoteRef) {
  runCommand('git', ['fetch', 'origin', branch]);
  runCommand('git', ['checkout', '-B', branch, remoteRef]);
}

function landingHasChanges(landingPath) {
  const { status } = runCommand('git', ['diff', '--quiet', '--', landingPath], {
    allowFailure: true,
  });
  return status !== 0;
}

function applyLandingUpdateScript({ version, appPath, dmgPath, landingPath }) {
  const scriptPath = path.join(__dirname, 'update-landing-release.js');
  runCommand('node', [
    scriptPath,
    '--app',
    appPath,
    '--dmg',
    dmgPath,
    '--landing',
    landingPath,
    '--version',
    version,
  ]);
}

function commitLandingUpdate({ landingPath, version }) {
  runCommand('git', ['add', landingPath]);
  runCommand('git', ['commit', '-m', buildCommitMessage(version)]);
}

function pushDirectBranch(branch) {
  runCommand('git', ['push', 'origin', branch]);
}

function findOpenPrNumber({ baseBranch, headBranch }) {
  const { stdout } = runCommand('gh', [
    'pr',
    'list',
    '--base',
    baseBranch,
    '--head',
    headBranch,
    '--state',
    'open',
    '--json',
    'number',
    '-q',
    '.[0].number',
  ], { allowFailure: true });

  return stdout || null;
}

function createPullRequest({ baseBranch, headBranch, version }) {
  const { stdout } = runCommand('gh', [
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    headBranch,
    '--title',
    buildCommitMessage(version),
    '--body',
    [
      '## Summary',
      `- Автоматическое обновление размеров DMG и установленного приложения после релиза \`v${version}\`.`,
      '- Коммит создан release workflow после сборки фактических артефактов.',
      '',
      '## Checking',
      '1. Открыть `docs/landing/index.html` и проверить ссылки на DMG `v' + version + '`.',
      '2. Убедиться, что в `cta-note` указаны актуальные размеры загрузки и установки.',
    ].join('\n'),
  ]);

  const byUrl = runCommand('gh', ['pr', 'view', stdout, '--json', 'number', '-q', '.number']);
  return byUrl;
}

function mergePullRequest(prNumber) {
  const attempts = [
    ['gh', ['pr', 'merge', prNumber, '--merge', '--admin']],
    ['gh', ['pr', 'merge', prNumber, '--merge']],
  ];

  let lastError = null;
  for (const [command, args] of attempts) {
    try {
      runCommand(command, args);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function updateBranch({
  branch,
  version,
  appPath,
  dmgPath,
  landingPath,
  checkoutBranchImpl = checkoutBranch,
  applyLandingUpdateScriptImpl = applyLandingUpdateScript,
  landingHasChangesImpl = landingHasChanges,
  commitLandingUpdateImpl = commitLandingUpdate,
  pushDirectBranchImpl = pushDirectBranch,
  pushPrBranchImpl = (prBranch) => runCommand('git', ['push', 'origin', prBranch, '--force-with-lease']),
  findOpenPrNumberImpl = findOpenPrNumber,
  createPullRequestImpl = createPullRequest,
  mergePullRequestImpl = mergePullRequest,
}) {
  const strategy = getUpdateStrategy(branch);

  if (strategy === 'direct') {
    checkoutBranchImpl(branch, `origin/${branch}`);
    applyLandingUpdateScriptImpl({ version, appPath, dmgPath, landingPath });

    if (!landingHasChangesImpl(landingPath)) {
      console.log(`==> ${branch}: лендинг уже актуален`);
      return { branch, strategy, changed: false };
    }

    commitLandingUpdateImpl({ landingPath, version });
    pushDirectBranchImpl(branch);
    console.log(`==> ${branch}: обновление запушено`);
    return { branch, strategy, changed: true };
  }

  const prBranch = buildPrBranchName(version);
  checkoutBranchImpl(prBranch, `origin/${branch}`);
  applyLandingUpdateScriptImpl({ version, appPath, dmgPath, landingPath });

  if (!landingHasChangesImpl(landingPath)) {
    console.log(`==> ${branch}: лендинг уже актуален`);
    return { branch, strategy, changed: false };
  }

  commitLandingUpdateImpl({ landingPath, version });
  pushPrBranchImpl(prBranch);

  let prNumber = findOpenPrNumberImpl({ baseBranch: branch, headBranch: prBranch });
  if (!prNumber) {
    prNumber = createPullRequestImpl({
      baseBranch: branch,
      headBranch: prBranch,
      version,
    });
  }

  mergePullRequestImpl(prNumber);
  console.log(`==> ${branch}: PR #${prNumber} влит`);
  return { branch, strategy, changed: true, prNumber };
}

function main(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    args.set(argv[i], argv[i + 1]);
  }

  const version = args.get('--version');
  const appPath = args.get('--app');
  const dmgPath = args.get('--dmg');
  const landingPath = args.get('--landing') ?? 'docs/landing/index.html';
  const branchesArg = args.get('--branches') ?? 'develop,main';

  if (!version || !appPath || !dmgPath) {
    console.error(
      'Использование: push-landing-release-update.js --version <x.y.z> ' +
        '--app <.app> --dmg <.dmg> [--landing docs/landing/index.html] ' +
        '[--branches develop,main]',
    );
    process.exit(1);
  }

  configureGitIdentity();

  for (const branch of branchesArg.split(',').map((item) => item.trim()).filter(Boolean)) {
    updateBranch({ branch, version, appPath, dmgPath, landingPath });
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  DIRECT_PUSH_BRANCHES,
  PR_MERGE_BRANCHES,
  buildCommitMessage,
  buildPrBranchName,
  getUpdateStrategy,
  updateBranch,
};
