'use strict';

const {
  buildCommitMessage,
  buildPrBranchName,
  getUpdateStrategy,
  updateBranch,
} = require('../scripts/push-landing-release-update.js');

describe('push-landing-release-update', () => {
  test('develop обновляется прямым push', () => {
    expect(getUpdateStrategy('develop')).toBe('direct');
  });

  test('main обновляется через pull request', () => {
    expect(getUpdateStrategy('main')).toBe('pull-request');
  });

  test('buildPrBranchName формирует стабильное имя ветки', () => {
    expect(buildPrBranchName('1.2.4')).toBe('chore/landing-size-v1.2.4');
  });

  test('buildCommitMessage совпадает с release workflow', () => {
    expect(buildCommitMessage('1.2.4')).toBe('chore: update landing download size for v1.2.4');
  });

  test('updateBranch для main создаёт PR и вливает его', () => {
    const calls = [];

    const result = updateBranch({
      branch: 'main',
      version: '1.2.4',
      appPath: 'app.app',
      dmgPath: 'app.dmg',
      landingPath: 'docs/landing/index.html',
      checkoutBranchImpl: (branch, remoteRef) => {
        calls.push(['checkout', branch, remoteRef]);
      },
      applyLandingUpdateScriptImpl: (payload) => {
        calls.push(['apply', payload.version]);
      },
      landingHasChangesImpl: () => true,
      commitLandingUpdateImpl: ({ version }) => {
        calls.push(['commit', version]);
      },
      pushPrBranchImpl: (prBranch) => {
        calls.push(['push', prBranch]);
      },
      findOpenPrNumberImpl: () => null,
      createPullRequestImpl: () => '42',
      mergePullRequestImpl: (prNumber) => {
        calls.push(['merge', prNumber]);
      },
    });

    expect(result).toEqual({
      branch: 'main',
      strategy: 'pull-request',
      changed: true,
      prNumber: '42',
    });
    expect(calls).toEqual([
      ['checkout', 'chore/landing-size-v1.2.4', 'origin/main'],
      ['apply', '1.2.4'],
      ['commit', '1.2.4'],
      ['push', 'chore/landing-size-v1.2.4'],
      ['merge', '42'],
    ]);
  });
});
