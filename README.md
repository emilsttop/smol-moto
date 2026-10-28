# Прокат электромотоциклов, Смоленск

Сайт-визитка: https://smol-moto.ru. Запись только по телефону, сайт не собирает персональные данные.
Полное описание проекта: `CLAUDE.md` в родительской папке «Мотопрокат».

- `web/` — сайт (Astro, статическая сборка). Публикуется на **GitHub Pages**: каждый push в `main`
  запускает `.github/workflows/pages.yml`, домен задан файлом `web/public/CNAME`.
- `api/` — Fastify-сервер. Сейчас нужен только для временной раздачи сайта с боевой машины
  (`deploy/deploy_prod.sh`); приём заявок в нём выключен (`LEADS_ENABLED=false`).

## Локально

```
cd web && npm i && npm run build && npm run preview
```

Новые фото: исходник в папку «Мотопрокат», описать кадр в `web/scripts/photos.mjs`, `npm run photos`.
Видеоотзывы: `web/src/config.ts → videoReviews`.
