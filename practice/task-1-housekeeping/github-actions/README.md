# GitHub Actions — housekeeping → draft PR

Це неактивний навчальний приклад. GitHub виконує workflow-файли лише з `.github/workflows/`, тому
[housekeeping-pr.yml](./housekeeping-pr.yml) у цій підтеці сам по собі нічого не запускає.

## Що він демонструє

```text
ручний запуск або cron
  → checkout main
  → унікальна chore/housekeeping-<run-id>
  → Claude читає ../PROMPT.md і робить один прохід
  → runner приймає лише один чистий коміт і зелений verify
  → push гілки
  → draft PR у main
```

Якщо безпечної роботи немає, workflow завершується без гілки й PR. Merge завжди лишається рішенням людини.

## Що налаштувати

1. На своїй машині запустіть `claude setup-token`. Команда проведе через OAuth-вхід і надрукує довгоживучий
   token. Він працює з Claude Pro, Max, Team або Enterprise.
2. У GitHub відкрийте **Settings → Secrets and variables → Actions** і створіть secret
   `CLAUDE_CODE_OAUTH_TOKEN` з цим значенням. Не записуйте token у YAML, Git або логи.
3. У **Settings → Actions → General → Workflow permissions** дозвольте write-доступ і створення pull request від
   GitHub Actions. У великій організації цей пункт може контролювати адміністратор.
4. Скопіюйте приклад туди, де GitHub його побачить:

```bash
mkdir -p .github/workflows
cp practice/task-1-housekeeping/github-actions/housekeeping-pr.yml \
  .github/workflows/housekeeping-pr.yml
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force .github/workflows
Copy-Item practice/task-1-housekeeping/github-actions/housekeeping-pr.yml `
  .github/workflows/housekeeping-pr.yml
```

5. Закомітьте workflow в `main`. У GitHub відкрийте **Actions → Housekeeping draft PR → Run workflow** і
   спочатку перевірте ручний запуск. Cron у прикладі стартує щопонеділка о 08:00 UTC.

## Важливі межі

- Scheduled workflow бере файл із default branch, тому приклад має бути в `main`.
- Кожен прохід витрачає GitHub Actions minutes і токени Anthropic. Не вмикайте cron без явного ліміту часу.
- PR створює вбудований `GITHUB_TOKEN`. Події від цього токена зазвичай не запускають інші workflow. Тому
  приклад сам запускає `verify` до push. Якщо на згенерованому PR обов'язковий окремий CI, замініть
  `GITHUB_TOKEN` на токен GitHub App із мінімальними `contents:write` і `pull_requests:write` permissions.
- Цей workflow готує лише draft PR. Людина читає diff і вирішує, чи закрити PR, чи зробити його ready, чи merge.

Джерела: [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[Claude Code GitHub Actions](https://code.claude.com/docs/en/github-actions),
[Claude Code authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token).
