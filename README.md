# Prozorro Procurement Monitor

MVP-сервіс для моніторингу закупівель Prozorro одного організатора. Сервіс читає список закупівель із Google Sheets, отримує повний об'єкт закупівлі з Prozorro API, порівнює його з попереднім snapshot, фіксує події в Google Sheets і надсилає Telegram-сповіщення про важливі зміни.

Дані про уповноважену особу беруться тільки з листа `Config`. Prozorro API для цього не використовується.

## Встановлення

```bash
npm install
```

## Налаштування `.env`

Скопіюйте приклад:

```bash
cp .env.example .env
```

Заповніть:

```env
GOOGLE_SHEETS_SPREADSHEET_ID=...
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# Альтернатива для CI:
GOOGLE_PRIVATE_KEY_BASE64=
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
PROZORRO_PORTAL_API_BASE_URL=https://prozorro.gov.ua/api
```

`GOOGLE_PRIVATE_KEY` можна залишити в один рядок із `\n`; сервіс сам перетворить їх на переноси рядків.

Для GitHub Actions найстабільніший варіант - створити secret `GOOGLE_PRIVATE_KEY_BASE64`. На локальній машині:

```bash
node -e "const fs=require('fs'); const key=JSON.parse(fs.readFileSync('path/to/service-account.json','utf8')).private_key; console.log(Buffer.from(key).toString('base64'))"
```

Але в secret треба покласти не весь JSON, а base64 від значення поля `private_key`. Якщо використовуєте `GOOGLE_PRIVATE_KEY`, вставляйте саме `private_key` з JSON без зовнішніх лапок.

## Google Sheets

Створіть Google Spreadsheet і надайте service account права редактора. Потрібні листи:

- `Config`
- `Tenders`
- `Events`
- `State`
- `TenderMap`

Для `Tenders`, `Events`, `State` і `TenderMap` сервіс створить лист і заголовки, якщо вони відсутні. Лист `Config` потрібно заповнити вручну.

### Config

Колонки:

```text
Ідентифікатор закупівлі | Уповноважена особа | enabled
UA-2025-06-01-000123-a | Іваненко | TRUE
UA-2025-06-02-000456-b | Петренко | TRUE
```

Правила:

- `Ідентифікатор закупівлі` - Prozorro tender ID.
- `Уповноважена особа` - прізвище або ПІБ відповідальної особи.
- якщо `enabled` відсутній, рядок активний;
- якщо `enabled = FALSE`, закупівля не моніториться;
- якщо `Уповноважена особа` порожня, використовується `Не вказано`.

### TenderMap

Службовий кеш відповідності публічного номера закупівлі та внутрішнього Prozorro `id`.

Колонки:

```text
tender_id | prozorro_internal_id | resolved_at | source
```

Якщо в `Config` вказано `UA-...`, сервіс один раз звертається до:

```http
GET https://prozorro.gov.ua/api/tenders/{tenderID}/summary
```

Після цього записує `id` у `TenderMap` і надалі використовує кеш без повторного пошуку.

## Запуск локально

```bash
npm run dev
```

При старті сервіс перевіряє доступ до Google Sheets, запускає cron і одразу виконує один цикл моніторингу.

Для одноразового запуску без cron:

```bash
npm run dev:once
```

## Build і production-запуск

```bash
npm run build
npm start
```

Одноразовий production-запуск:

```bash
npm run build
npm run monitor:once
```

## Запуск через GitHub Actions

У репозиторії вже є workflow:

```text
.github/workflows/monitor.yml
```

Він запускає один цикл моніторингу кожні 10 хвилин і також підтримує ручний запуск через `workflow_dispatch`.

Додайте в GitHub repository secrets:

```text
GOOGLE_SHEETS_SPREADSHEET_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_PRIVATE_KEY_BASE64
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

Потрібен або `GOOGLE_PRIVATE_KEY`, або `GOOGLE_PRIVATE_KEY_BASE64`. `GOOGLE_PRIVATE_KEY` вставляйте повністю, включно з:

```text
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
```

Можна також вставляти ключ в один рядок із `\n`.

Після push у default branch workflow почне запускатися за розкладом. Для перевірки відкрийте `Actions` у GitHub і запустіть `Prozorro Monitor` вручну.

## Запуск на VPS через PM2

```bash
npm install
npm run build
pm2 start dist/index.js --name prozorro-monitor
pm2 save
pm2 logs prozorro-monitor
```

Після зміни `.env` перезапустіть процес:

```bash
pm2 restart prozorro-monitor
```

## Cron

Змінні:

```env
CRON_ACTIVE=*/10 * * * *
CRON_COMPLETED=0 */6 * * *
```

У поточному MVP обидва cron-завдання перечитують активні рядки з `Config`. Окремий режим для завершених закупівель залишено як точку розширення.

## Події

Відстежуються:

- `STATUS_CHANGED`
- `DOCUMENT_ADDED`
- `DOCUMENT_UPDATED`
- `COMPLAINT_ADDED`
- `COMPLAINT_STATUS_CHANGED`
- `QUESTION_ADDED`
- `QUESTION_ANSWERED`
- `QUALIFICATION_ADDED`
- `QUALIFICATION_STATUS_CHANGED`
- `CONTRACT_ADDED`
- `CONTRACT_STATUS_CHANGED`
- `MONITORING_STARTED`
- `MONITORING_STATUS_CHANGED`
- `MONITORING_CONCLUSION_ADDED`
- `MONITORING_CLOSED`

Telegram-сповіщення надсилаються для подій із рівнем `warning` або `critical`.

## Ризики

- `normal` - немає активних проблем.
- `warning` - нове питання, новий/оновлений документ, зміна статусу, зміни кваліфікації або контракту.
- `critical` - нова скарга, активна скарга, відкритий моніторинг ДАСУ, зміна статусу моніторингу або висновок.

## State snapshot

Попередній стан зберігається в `State.state_json`. Якщо `dateModified` тендера не змінився, сервіс не робить глибокий diff по тендеру, але все одно:

- оновлює `responsible_person` із `Config`;
- перевіряє моніторинги ДАСУ;
- оновлює `State`.

## Monitoring / Audit API

MVP використовує endpoint:

```http
GET /tenders/{tender_id}/monitorings
```

Public Prozorro API не потребує ключа для читання відкритих даних. Водночас endpoint `GET /tenders/{id}` працює з внутрішнім `id` Prozorro, а не з публічним номером `UA-...`. Тому сервіс підтримує два формати в `Config`:

- внутрішній 32-символьний `id` Prozorro;
- публічний `tenderID` формату `UA-...`, який сервіс резолвить через портальний endpoint `https://prozorro.gov.ua/api/tenders/{tenderID}/summary` і кешує в `TenderMap`.

Ідентифікатори `UA-P-...` є планами закупівель, а не тендерами, тому для `GET /tenders/{id}` вони не підходять.

Формат відповіді моніторингів нормалізується у `src/prozorro/monitoring.client.ts`: підтримуються варіанти `data: []` і `data: { data: [] }`. На реальному API потрібно перевірити точний endpoint і структуру об'єкта моніторингу для вашого середовища Prozorro. Якщо endpoint відрізняється, змініть тільки `MonitoringClient.getMonitorings()`.

## Відомі обмеження MVP

- Немає веб-інтерфейсу.
- Немає бази даних; стан зберігається в Google Sheets.
- Немає пакетної оптимізації оновлень Sheets для дуже великої кількості закупівель.
- Перший запуск створює snapshot без генерації історичних подій.
- `CRON_COMPLETED` поки не має окремого фільтра завершених закупівель.
- Резолвінг `UA-...` використовує публічний API порталу Prozorro, який використовує сам сайт. Це практичний і швидкий endpoint, але формально менш стабільний контракт, ніж OpenProcurement API.
- Endpoint ДАСУ-моніторингів потребує перевірки на реальному Prozorro API.
