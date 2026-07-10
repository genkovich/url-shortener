# Демо — один Ralph checkpoint у Claude Code

Ця гілка підготовлена для короткої демонстрації, а не для завершення всієї фічі. За один
checkpoint Ralph бере T1 з `input-validation`, запускає Claude coordinator-а, а той послідовно
делегує роботу трьом project agents:

```text
ralph.mjs
  → Claude coordinator
      → test-author: RED
      → implementer: GREEN → REFACTOR → GATE
      → reviewer: REVIEW_CLEAN
  → coordinator: tracker → done, COMMIT
  → Ralph: незалежний gate і метрика done/todo
```

`MAX_ITER=1` обмежує один зовнішній checkpoint, а не один model-виклик. Звичайний прохід
використовує coordinator-а і трьох субагентів; повторне виправлення після review може додати
ще виклики. Перед справжнім запуском перевірте фінансовий ліміт у провайдера.

## 1. Перевір старт

З кореня репозиторію:

```bash
git branch --show-current
git status --short
npm run doctor
claude auth status
```

Очікуємо гілку `demo/claude-ralph`, чистий `git status`, доступний Claude Code і чинну
авторизацію. Якщо дерево брудне, не запускайте Ralph: він має починати з відомого стану.

## 2. Покажи, звідки береться робота

Відкрийте чотири джерела, не редагуючи їх:

```bash
sed -n '1,58p' loop/PROMPT.md
sed -n '1,90p' .claude/skills/implement/SKILL.md
cat docs/features/input-validation/tasks/tracker.md
sed -n '1,145p' docs/features/input-validation/tasks/T1-validate-url-guard.md
```

- `loop/PROMPT.md` задає один checkpoint і порядок ролей.
- `implement/SKILL.md` містить TDD-контракт.
- `tracker.md` визначає першу доступну `todo`-задачу.
- `T1-validate-url-guard.md` містить acceptance criteria та Definition of Done.

Ralph не вигадує завдання й не читає roadmap як автоматичну чергу. Slug передає людина через
`--feature input-validation`.

## 3. Зроби dry run без моделі

```bash
MAX_ITER=1 K_FAILURES=1 NO_IMPROVEMENT=1 \
npm run ralph -- --feature input-validation --dry-run
```

Перевірте головні рядки:

```text
агент:    claude -p --permission-mode auto
ціль:     input-validation: 0 done, 5 todo
гілка:    demo/claude-ralph · дерево чисте
старт:    готовий
зупинки:  MAX_ITER=1 · K_FAILURES=1 · NO_IMPROVEMENT=1
```

Dry run не запускає Claude, не витрачає токени й не змінює файли.

## 4. Запусти один справжній checkpoint

```bash
MAX_ITER=1 K_FAILURES=1 NO_IMPROVEMENT=1 \
npm run ralph -- --feature input-validation
```

У цьому терміналі має бути видно:

1. `--- ітерація 1/1 ---`;
2. dispatch `test-author` і доказ GOOD RED;
3. handoff до `implementer`, GREEN та gate;
4. незалежний `reviewer`;
5. `REVIEW_CLEAN` або конкретні findings і повторне виправлення;
6. підсумок Ralph із `done/todo` та станом gate.

Нічого не вводьте, поки команда працює. Для аварійної зупинки натисніть `Ctrl+C` один раз і
дочекайтеся повідомлення Ralph. Після ручної зупинки спочатку перевірте `git status`.

Після успішної T1 команда однаково завершиться через `MAX_ITER=1` без `DONE`. Це очікувана
демонстраційна зупинка: одна задача готова, але вся фіча з п'яти задач ще ні.

## 5. Перевір факти, а не звіт моделі

```bash
cat docs/features/input-validation/tasks/tracker.md
git log --oneline --decorate -6
git show --stat --oneline HEAD
git status --short
tail -n 40 loop/JOURNAL.md
npm run verify
```

Успішний checkpoint має залишити:

- T1 зі статусом `done`;
- один новий task-коміт із трейлерами `SDD-Task` і `SDD-AC`;
- чисте робоче дерево;
- зелений `npm run verify`;
- короткий checkpoint у `loop/JOURNAL.md`.

Текст у консолі та journal пояснює роботу, але джерелами правди лишаються tracker, Git і ворота.
Ralph не виконує `git push` і не перемикається на `main`.

## Повторити показ із чистого стану

Після демонстрації не продовжуйте ту саму гілку. В іншому чистому checkout створіть нову
одноразову гілку від віддаленої підготовленої точки:

```bash
git fetch origin
git switch -c demo/claude-ralph-run-2 origin/demo/claude-ralph
```

Нова назва потрібна для кожного повтору. Так попередні task-коміти не вплинуть на початкові
`0 done, 5 todo`.
