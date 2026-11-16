# Page Operations — Sitecore Marketplace app

Change page URLs, move, duplicate and delete pages in SitecoreAI **without breaking links**.
Every change shows its impact first, adds the right redirects automatically, publishes in one
step and can be undone.

Built with `@sitecore-marketplace-sdk/client`, `/xmc` and `/ai`, and the Blok design system.

## Extension points

| Extension point        | Route          | What authors get |
| ---------------------- | -------------- | ---------------- |
| Standalone             | `/standalone`  | Opens from the Cloud Portal. Lists every environment the app is installed on with its sites; pick one, then the full workspace. Switch environments from the top bar. |
| Pages Context Panel    | `/panel`       | The open page: change URL, move, duplicate, delete, create subpage, languages and versions, AI translation, components, live status, preview, link health, undo |
| Full Screen            | `/fullscreen` | Four tabs. **Pages**: browse (Tree / All with bulk publish, move, delete) and work on one page (Links, Languages, Versions with compare and restore, Components, Details). **Health**: one site scan for broken links, linked-but-not-live pages, orphans and stale content, plus URL issues and not-found (404) URLs with suggested redirects. **Redirects**: rules with issue filters and inline fixes, and campaigns with start and end dates. **Activity**: history with undo. |

## Quick start

```bash
npm install
npm run ui:install   # pulls every Blok component + theme into src/components/ui and globals.css
npm run dev          # http://localhost:3000: a launcher for all three extension points
```

Opened outside Sitecore, the app switches to a **sample site** (an outdoor-gear brand with
realistic redirect problems: a loop, a chain, a broken target, a hidden page, a duplicate, and
messy URLs). Every operation really runs against it, so you can demo and test the full flow.
Force it with `?mock` or `NEXT_PUBLIC_MOCK=1`.

## Working together

- **Home** (first tab in Full Screen and Standalone) shows only what needs attention: changes not live yet, setup problems, site health from the last scan, redirects to fix, campaigns that ended, what goes live or comes down this week, and recent changes with undo.
- **Not live yet**: every change made through the app is remembered until it's published. The top bar (and the Pages panel) shows "N not live" with one **Publish all**. Publishing anything from the app removes it from the list.
- **Background jobs**: the site scan, bulk publish/move/delete/fix and publish-all run outside the screen that started them, so they keep going while you work. Progress is in the top bar.
- **Setup check** (gear icon): tests the home page, the Authoring API mutations the app uses, the redirects folder and template, link search, page content access, live status, the agent API, team storage and Search Console, and says what each affects.
- **Shared with the team**: settings, activity (with who did what, and undo from any browser) and the not-live list are stored in Sitecore under `{site}/Settings/Page Operations` (subfolders Activity, Pending and Bin) (with *Never publish* on, so it never reaches the live site). Each entry is its own item, so authors never overwrite each other. If that folder can't be created, the app keeps working in each browser and the setup check says so.

## App icon

`public/app-icon-512.png` (and `app-icon-1024.png`) is the Marketplace listing icon. `src/app/icon.png` is the browser favicon, and the same mark sits in the app's top bar.

## Search Console (optional, for the 404 report)

Google's API no longer offers a 404 report, so the app works it out: it reads the pages Google sent visitors to in the last 28 days and keeps those that aren't live pages and have no redirect. To turn it on:

1. In Google Cloud, create an OAuth client of type **Web application** and add your app's URL as an authorised JavaScript origin.
2. In Page Operations → Settings, paste the client ID and your Search Console property (`sc-domain:example.com` or `https://www.example.com/`).

Sign-in happens in a Google pop-up in the author's browser with read-only access. Nothing is stored on a server. Without it, import the "Not found (404)" CSV that Search Console exports, or any CSV of URLs from your logs.

## Deploy to Vercel

1. Import the GitHub repo in Vercel. The defaults are right (framework: Next.js, build: `next build`).
2. Don't set `NEXT_PUBLIC_MOCK` (or set it to `0`) so the app talks to Sitecore.
3. Before the first deploy, install the Blok components and commit them: `npm run ui:install`, then commit `src/components/ui`, `src/lib/icon.tsx` and the updated `globals.css`. The script installs only the 23 components the app uses; installing the whole Blok library adds components (calendar, date picker) that don't build with current dependencies.
4. Use the deployment URL for the extension points below, and for the listing links:
   - Support: `https://your-host/support`
   - Privacy policy: `https://your-host/privacy`
   - Terms: `https://your-host/terms`

The public pages don't connect to Sitecore, so they load anywhere. Publisher details on them (company name, emails, hosting, governing law, response time) are in `src/lib/company.ts`: check them before submitting.

## Register the app (Sitecore Cloud Portal → Developer studio)

1. Create a custom app and set the deployed URL.
2. Add extension points: **Standalone** → `https://your-host/standalone`, **Full Screen** → `https://your-host/fullscreen`, **Pages Context Panel** → `https://your-host/panel`.
   Already registered Full Screen at `/`? It keeps working (the root forwards to `/fullscreen`), but update it when you can.
3. API access: grant SitecoreAI (XM Cloud) APIs. Grant AI skills if you want the brand-voice check.
4. Install it on an organization and give it access to an environment.

`next.config.ts` only allows the app to be framed by `*.sitecorecloud.io`, `*.sitecorecloud.app` and localhost.

## What it does

**Change URL** — live URL checks (special characters, underscores, duplicates among siblings,
reserved names) with a one-click clean version. Review shows a before/after URL diff and exactly what
will happen: the 301 from the old URL, one pattern redirect for child pages, older redirects that are
re-pointed so visitors never hop twice, redirects that would hide the new URL, and every page or
content item that links here.

**Move** — tree or URL search; blocks moving into itself, into its own children, or under a page whose
insert options don’t allow it, and warns about name clashes.

**Duplicate** — clean name and display name, optional AI brand-voice check, and an honest warning that
shared datasources stay shared.

**Delete safely** — shows what links here, sends visitors to the parent, another page or a 404,
re-points redirects that targeted the page, and asks the author to type the page name.

**Create subpage**: pick from the page's allowed page types, with a clean URL generated from the title.

**Languages and versions**: every site language with its versions and live status. Add an empty language
version, translate with Sitecore AI from the current language, add or delete versions.

**Components and content**: what's on the page, grouped by placeholder, marking content that's shared
with other pages.

**Details and live status**: published-or-not check against Edge, screenshot, preview link, template,
version, workflow, created/edited history, publishing restrictions, item ID and path.

**Bulk (Full Screen → Pages → All pages)**: publish, move (with redirects) or delete (with redirects to
each parent) many pages at once, with progress and a list of anything that failed.

**Publish with what it needs**: before publishing, see the component content, images and linked pages the page uses. It publishes with Sitecore's related-items option, plus any unpublished linked pages you tick.

**Take offline / put back online**: turns on the page's "Never publish" setting and publishes, so it leaves the live site but stays in Sitecore, with an optional redirect. Putting it back reverses both.

**Schedule**: go-live and take-down dates (the item's `__Publish` / `__Unpublish`). Sitecore applies them at the next publish after each date.

**Bin**: Delete moves the page to a `Bin` folder inside `{site}/Settings/Page Operations` (hidden from Page builder) and turns on "Never publish", so it can't go live. Where it came from is stored on the item (`__Long description`), so anyone can restore it from Pages → Bin. "Delete for good" sends it to Sitecore's recycle bin.

**Make shared content local**: copies a component's shared content into the page's own Data folder and points the component at the copy (in `__Final Renderings`). Content set in the page design is reported, not changed. Also offered when duplicating.

**Reorder subpages**: drag or use arrows; saves `__Sortorder`.

**Accessibility**: images without alt text (rich text, and image fields whose media item has no Alt), empty or vague links, skipped headings, extra Heading 1s, tables without headers. Alt text can be added inline.

**Find and replace**: on one page, a section or the whole site. Only visible text by default (not links or markup), every match approved first, optionally saved as new versions, undoable.

**Edit in Page builder**: every page has a button (page header, Details, Health reports) that opens it in SitecoreAI Page builder in a new tab, with the right tenant, organization, site, language and version. The link pattern is in Settings in case Sitecore changes it.

**After every change** — publish the page (with children), the redirect maps and the referring pages
in one step, and undo from the confirmation, a toast, the panel or Activity.

**Full Screen** — link health (loops, broken targets, hidden pages, chains) with one-click fixes and
"fix all chains"; a redirects table with search, filters, bulk delete, an editor that previews every
hop before saving, a URL tester, CSV import with row-by-row checks, and CSV export; a page browser that
reuses the panel workbench; a URL audit with bulk fixes; activity with undo; settings; and ⌘K to jump anywhere.
The current view is stored in the host URL (`application.urlState`), so links and reloads reopen it.

## How it talks to Sitecore

All calls live in `src/lib/sitecore/api.ts`.

| Need                          | SDK call                                                         |
| ----------------------------- | ---------------------------------------------------------------- |
| Current page / site           | `pages.context` subscription, `pages.reloadCanvas`               |
| Rename, duplicate, delete     | `xmc.pages.renamePage`, `duplicatePage`, `deletePage`            |
| Page details and route        | `xmc.pages.retrievePage`                                         |
| Tree and insert options       | `xmc.sites.retrievePageHierarchy`, `listPageChildren`            |
| All routes (target checks)    | `xmc.agent.sitesGetAllPagesBySite`                               |
| Move, redirect maps, publish  | `xmc.authoring.graphql` (`moveItem`, `updateItem`, `createItem`, `publishItem`) |
| Who links here                | `xmc.authoring.graphql` `search` on the `_links` index field      |
| Brand voice                   | `ai.skills.generateBrandReview` (only when the site has a brand kit) |
| Home page / tree              | `xmc.sites.retrieveSiteHierarchy` (works when the site list has no home page ID) |
| Create page, page types       | `xmc.pages.createPage`, `retrieveInsertOptions`                  |
| Versions                      | `xmc.pages.retrievePageVersions`, `addPageVersion`, `deletePageVersions` |
| Languages, AI translation     | `xmc.agent.pagesAddLanguageToPage`, `xmc.pages.translatePage`    |
| Live status                   | `xmc.pages.getLivePageState`                                     |
| Components, screenshot, preview | `xmc.agent.pagesGetComponentsOnPage`, `pagesGetPageScreenshot`, `pagesGetPagePreviewUrl` |
| Version compare, link checks  | `xmc.authoring.graphql` `item(version:) { fields }` and `__Final Renderings` datasources |
| Campaign windows              | Redirect Map item publishing restrictions (`__Publish`, `__Unpublish`) |
| Language and workflow stats   | `xmc.sites.retrieveLocalizationStatistics`, `retrieveWorkflowStatistics` |

If the agent API that lists every route isn't available, the app walks the page tree instead.

Redirects are SXA headless **Redirect Map** items (`UrlMapping`, `RedirectType`, `PreserveQueryString`)
under `{site}/Settings/Redirects`. The app reads every map, and writes new rules to its own map
("Page Operations"), which it creates on first use.

## Verify on your instance

These are configurable in Settings, and the GraphQL is in one file (`src/lib/sitecore/queries.ts`):

- **Redirects folder** and **Redirect Map template path** match your SXA version.
- **Links index field** (`_links`) exists in your search index, so "who links here" works. If not,
  the app shows a clear notice and every operation still works.
- Field names in the Authoring GraphQL schema (`moveItem`, `publishItem` inputs, `search` results)
  match your environment.
- URLs are built lowercase with hyphens for spaces (the usual XM Cloud setup). The app always reads the
  real route back after a change, and builds redirects from that, not from its prediction.

## Notes

- Settings and activity history are stored in the author’s browser.
- Undo of a delete restores redirects; the page itself comes back from the recycle bin.
- Nothing goes live until it’s published, and the app never publishes without the author’s click.

## Project map

```
src/app/                 layout, / (full screen), /panel
src/lib/marketplace/     SDK init (XMC + AI modules), provider, sample host
src/lib/sitecore/        api, queries, redirects logic, slug rules, routes, types
src/lib/ops/             operations (change URL, move, duplicate, delete, undo)
src/components/ops/      flows, URL diff, impact review, page picker, publish panel
src/components/panel/    context panel
src/components/workspace full screen sections
```
