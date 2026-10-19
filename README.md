# Blackwood Detective CRM

Закрытая CRM детективного бюро для GTA RP: дела, доски расследований, информаторы, оперативные сведения и задачи.

## Локальный запуск

1. Создайте PostgreSQL-базу `detective_crm`.
2. Скопируйте `backend/.env.example` в `backend/.env` и смените секреты.
3. Подготовьте сервер:

```powershell
cd backend
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run dev
```

4. В другом терминале запустите интерфейс:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Откройте `http://localhost:5173`. Vite проксирует `/api` на `http://127.0.0.1:3000`.

## Размещение

GitHub хранит исходный код, но GitHub Pages не запускает Node.js и PostgreSQL. Для общей базы разместите `backend` и PostgreSQL на Render, Railway, Fly.io или VPS, а фронтенд — на GitHub Pages/Vercel. При раздельных доменах задайте `VITE_API_URL` для фронтенда и `FRONTEND_ORIGIN` для сервера.

Данные браузера используются только как демонстрационный запасной режим, когда API недоступен. При работающем сервере новые профили, дела, задачи и отчёты пишутся в PostgreSQL.
