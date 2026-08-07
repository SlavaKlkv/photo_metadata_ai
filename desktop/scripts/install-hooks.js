#!/usr/bin/env node
'use strict';

/**
 * Ставит git-хуки проекта в каталог хуков репозитория.
 *
 * Хуки не версионируются вместе с рабочей копией, поэтому исходники лежат в
 * `desktop/scripts/hooks/`, а этот скрипт копирует их в `.git/hooks`. Чужой
 * хук с тем же именем не перезаписывается без `--force`.
 *
 * Запуск: npm run hooks:install (из desktop/)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOKS_SRC = path.resolve(__dirname, 'hooks');
// Маркер отличает наши хуки от чужих: по нему решаем, можно ли перезаписать.
const MARKER = 'landing-og-hook';

function hooksDir() {
  // В worktree каталог хуков общий с основным репозиторием.
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: HOOKS_SRC,
    encoding: 'utf8',
  }).trim();

  return path.resolve(HOOKS_SRC, common, 'hooks');
}

function install({ force = false } = {}) {
  const target = hooksDir();

  fs.mkdirSync(target, { recursive: true });

  return fs.readdirSync(HOOKS_SRC).map((name) => {
    const dest = path.join(target, name);

    if (fs.existsSync(dest) && !force) {
      const existing = fs.readFileSync(dest, 'utf8');

      if (!existing.includes(MARKER)) {
        return { name, dest, status: 'skipped' };
      }
    }

    fs.copyFileSync(path.join(HOOKS_SRC, name), dest);
    fs.chmodSync(dest, 0o755);

    return { name, dest, status: 'installed' };
  });
}

if (require.main === module) {
  const force = process.argv.includes('--force');

  install({ force }).forEach(({ name, dest, status }) => {
    if (status === 'skipped') {
      process.stderr.write(
        `${name}: пропущен — в ${dest} уже лежит чужой хук (--force перезапишет)\n`,
      );
      return;
    }

    process.stdout.write(`${name}: установлен в ${dest}\n`);
  });
}

module.exports = { MARKER, hooksDir, install };
