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
      landingPaths: ['docs/landing/index.html', 'docs/landing/screens.html', 'README.md'],
      checkoutBranchImpl: (branch, remoteRef) => {
        calls.push(['checkout', branch, remoteRef]);
      },
      applyLandingUpdateScriptImpl: (payload) => {
        calls.push(['apply', payload.version, payload.landingPaths]);
      },
      landingHasChangesImpl: (landingPaths) => {
        calls.push(['changed', landingPaths]);
        return true;
      },
      commitLandingUpdateImpl: ({ version, landingPaths }) => {
        calls.push(['commit', version, landingPaths]);
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
      ['apply', '1.2.4', ['docs/landing/index.html', 'docs/landing/screens.html', 'README.md']],
      ['changed', ['docs/landing/index.html', 'docs/landing/screens.html', 'README.md']],
      ['commit', '1.2.4', ['docs/landing/index.html', 'docs/landing/screens.html', 'README.md']],
      ['push', 'chore/landing-size-v1.2.4'],
      ['merge', '42'],
    ]);
  });
});
