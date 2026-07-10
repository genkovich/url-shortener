# Claude Code prompt — реалізувати `input-validation` без Ralph

Скопіюй увесь текст нижче в Claude Code. Перший рядок явно запускає вендорений repo skill.

```text
/implement input-validation

Повністю реалізуй цю SDD-фічу. Працюй самостійно
через перевірні checkpoints, доки всі задачі фічі не матимуть статус `done`, повний
`npm run verify` не стане зеленим, а робоче дерево не стане чистим.

Передумови
- Працюй лише в поточній гілці `feat/input-validation`.
- Якщо HEAD на `main` або `git status --porcelain` непорожній до першої правки, нічого не
  змінюй: повідом точну передумову, яка не виконана.
- Не запускай `npm run ralph`: ця Claude-сесія повністю замінює зовнішній цикл.
- Не створюй `DONE`: умовою завершення роботи є трекер, повний verify і чисте дерево.

Прочитай перед першим dispatch
1. `AGENTS.md`.
2. `docs/architecture-map.md`.
3. `docs/features/input-validation/spec.md`.
4. `docs/features/input-validation/sad.md`.
5. `docs/features/input-validation/tasks.json`.
6. `docs/features/input-validation/tasks/_epic.md`.
7. `docs/features/input-validation/tasks/tracker.md`.
8. `.claude/skills/implement/SKILL.md`.

Implementation engine — обов'язковий
- Перший рядок уже викликав repo skill `/implement input-validation`. Не замінюй його простим
  читанням `SKILL.md`: skill володіє DAG і TDD-протоколом.
- Для цього запуску перевизнач стандартний single-agent режим skill: кожну задачу виконуй через
  послідовний delegated pipeline `test-author → implementer → reviewer`.
- Не пиши тести або продукт-код напряму з coordinator-контексту. Coordinator обирає задачу,
  робить dispatch, перевіряє handoff, оновлює tracker, створює коміт і веде checkpoints.
- Не запускай агентів паралельно й не створюй для них worktree: у кожен момент працює рівно один
  агент у поточній `feat/input-validation`, а наступний отримує файли та handoff попереднього.
- Не переходь на general-purpose або single-agent fallback, доки доступні іменовані агенти. Якщо
  будь-якого з трьох немає, не імітуй його роль: зупини виконання й повідом точне ім'я агента.

Delegated checkpoint для кожної задачі
1. Skill будує DAG із `tasks.json` і обирає першу задачу `todo`, усі залежності якої `done`.
2. Делегуй project agent `test-author`: він читає задачу й acceptance criteria, пише лише
   RED-тест, запускає його та повертає команду і точний очікуваний failing assertion.
3. Лише після GOOD RED делегуй project agent `implementer`: він пише мінімальний продукт-код,
   робить `GREEN → REFACTOR` і запускає per-task gate. Він не послаблює тест.
4. Лише після зеленого handoff делегуй project agent `reviewer`: він незалежно й read-only
   перевіряє diff проти AC, task і конвенцій. За наявності finding поверни роботу implementer-у,
   повтори gate і знову виклич reviewer. Задача не завершена без `REVIEW_CLEAN`.
5. Після `REVIEW_CLEAN` coordinator оновлює `tracker.md` на `done` і створює один локальний коміт
   із трейлерами `SDD-Task: <id>` та `SDD-AC: <перелік>`.
6. Допиши в `loop/JOURNAL.md` короткий checkpoint: задача, що стало зеленим, перешкода і що
   лишилося. Не переписуй попередні записи.
7. Дай короткий статус: поточний checkpoint, які агенти відпрацювали, перевірений результат,
   `done/todo` і що далі. Продовж без запиту підтвердження.

Обмеження
- Не пиши продукт-код до червоного тесту й не послаблюй тести заради зеленого результату.
- Не вигадуй рішень, яких немає у специфікації, ADR або задачі.
- Не змінюй `docs/roadmap.md`, не перемикай гілку, не виконуй `git push`.
- Не додавай залежностей без прямого дозволу ADR.
- Не чіпай сторонні зміни або файли поза scope поточної задачі.
- Не роби більше шести implementation-checkpoints без участі людини.
- Якщо `done` не зросло два checkpoints поспіль або гейт червоний три checkpoints поспіль,
  припини повтори й повідом точну причину та стан диска.
- Якщо бракує продуктового рішення, постав залежну задачу в `blocked`, запиши одне конкретне
  питання в трекері й продовж лише незалежну доступну роботу. Не вгадуй.

Умова завершення
- Усі п'ять задач `input-validation` мають `done` у tracker.
- Для кожної завершеної задачі є окремий локальний коміт із потрібними трейлерами.
- `npm run verify` проходить повністю, включно з E2E.
- `git status --porcelain` порожній.

Не оголошуй роботу завершеною, доки всі чотири умови не виконані. У фінальному звіті наведи
виконані T1–T5, хеші їх комітів і результат `npm run verify`.
```
