# Previous Results — Contributor Guide

This page displays past simulation experiments from the PROMUEVA research group.

## Current data source

All results are stored in [`results-placeholder.md.ts`](./results-placeholder.md.ts).  
There are two exports:

| Export | Purpose |
|---|---|
| `FEATURED_RESULT` | The hero card at the top of the page. One study, markdown string. |
| `RESULT_ARTICLES` | The article grid below. Array of `ResultArticle` objects. |

## How to add a new result

Open `results-placeholder.md.ts` and append a new object to `RESULT_ARTICLES`:

```ts
{
  slug: "degroot-polarization-2025",   // URL-safe identifier, must be unique
  date: "2025-11-20",                  // ISO 8601 date (YYYY-MM-DD)
  title: "Polarization under DeGroot", // Card title (plain text)
  summary: "Short excerpt shown in …", // 1–2 sentences shown collapsed
  content: `                           // Full article in Markdown
## Background
...

## Results
...
  `,
},
```

To replace the featured hero, update the `FEATURED_RESULT` string at the top of the file.

### Rules

- `slug` must be unique across all entries — it is used as the HTML `id` and future URL segment.
- `date` must be a valid ISO date string; the page formats it automatically using the browser locale.
- `content` is rendered as Markdown (`react-markdown`). Headings (`##`, `###`), bold, lists, and tables are styled.
- Keep `summary` short — it is the teaser shown before the reader expands the card.

## Future migration (work in progress)

The `ResultArticle` type and the `ResultCard` / `ResultsPage` components are decoupled from the data source on purpose.  
When a backend is available, the migration only requires replacing the import of `RESULT_ARTICLES` with a data-fetching hook — no structural changes to the page or cards.

See issue [#46](https://github.com/krud3/univalle-trabajo-de-grado/issues/46) for context on the planned Experiment CRUD layer.
