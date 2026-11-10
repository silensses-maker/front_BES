# Changelog

## [2.0.22](https://github.com/silensses-maker/front_BES/compare/v2.0.0...v2.0.22) (2026-11-10)


### Features

* add LLM network prompt and download functionality; update various comments and documentation for consistency ([361aa71](https://github.com/silensses-maker/front_BES/commit/361aa710744789c193d51319faf24efea5a0aecd))
* add step indicator component for simulation wizard ([dc9fa3c](https://github.com/silensses-maker/front_BES/commit/dc9fa3c740fda482c4a1c5a646e454732f9a374e))
* add support for 'effect' clustering mode and update translations ([1c406ec](https://github.com/silensses-maker/front_BES/commit/1c406ec7ba528ee9eb1e2ee3ae0b4ed468b3977c))
* **charts:** polarization measures (TypeScript replica of pol_measures behind PUBLIC_ENABLE_POLARIZATION), variance over time, theme-aware colors and frame-coalesced live updates ([#129](https://github.com/silensses-maker/front_BES/issues/129)) ([edcb5a6](https://github.com/silensses-maker/front_BES/commit/edcb5a627b308ebb3c922463a830a30b88113d92))
* **docs:** in-app user manual (MDX, es/en, 84 screenshots), dev-only Auth emulator, and three front fixes ([c3c4bb6](https://github.com/silensses-maker/front_BES/commit/c3c4bb68e3f04e5fa7c2f37f699c5d79428e41bd))
* enhance CSV tests with network row serialization and download functionality ([8cfa3d8](https://github.com/silensses-maker/front_BES/commit/8cfa3d8ce2363b3cc6ec3a042be5b2c5328adb48))
* enhance dashboard components with tooltips, improve breadcrumb functionality, and update translations ([ed83646](https://github.com/silensses-maker/front_BES/commit/ed83646ade7e6ccd1f1aecf18f2e0fe920440c81))
* enhance simulation canvas and run view with de-cluster animation and updated grouping logic ([bcf0d5f](https://github.com/silensses-maker/front_BES/commit/bcf0d5fdc18417972e4b61c1a5191e40e2431522))
* enhance simulation configuration validation and user role management ([167e11d](https://github.com/silensses-maker/front_BES/commit/167e11d8f2765d53be969c2a40dae3a513e50af2))
* enhance step network custom with tooltips and validation messages ([dc9fa3c](https://github.com/silensses-maker/front_BES/commit/dc9fa3c740fda482c4a1c5a646e454732f9a374e))
* **history:** re-launch generated runs pre-filled, config export wit… ([4cce483](https://github.com/silensses-maker/front_BES/commit/4cce483c1d39b0b6c9103e9128c6dc77f01261ac))
* **history:** re-launch generated runs pre-filled, config export with version, runId and seed, history filters ([#127](https://github.com/silensses-maker/front_BES/issues/127)) ([aa46e88](https://github.com/silensses-maker/front_BES/commit/aa46e888c7da1475207bc667e952594fb0b757ee))
* implement network browser and selector for live run ([99f266c](https://github.com/silensses-maker/front_BES/commit/99f266cb40fecf4ee9f016723ce2e181a593c9f2))
* implement replay engine and control bar for simulation replay ([1d2978d](https://github.com/silensses-maker/front_BES/commit/1d2978d962a41a69e5470f039c363a6becfa9c98))
* implement RunView component for simulation playback and data visualization ([5c57cdc](https://github.com/silensses-maker/front_BES/commit/5c57cdcfc94dc1671205f3fa049451eb009a03d5))
* improve step network with quota hints and save mode descriptions ([dc9fa3c](https://github.com/silensses-maker/front_BES/commit/dc9fa3c740fda482c4a1c5a646e454732f9a374e))
* **landing:** about/contact/faq pages, translated 404, home copy via i18n and canvas loading state ([#125](https://github.com/silensses-maker/front_BES/issues/125)) ([0400305](https://github.com/silensses-maker/front_BES/commit/040030501185ba56216dc323475fa62d9154738e))
* **polarization:** compare up to 4 independently configured measures on the same chart, with a values/normalized axis ([#129](https://github.com/silensses-maker/front_BES/issues/129)) ([32b1d0a](https://github.com/silensses-maker/front_BES/commit/32b1d0a7373798a66390ef9095947b4ab2c96eba))
* **polarization:** table view (configured series or all measures) and CSV export in long and wide formats ([#129](https://github.com/silensses-maker/front_BES/issues/129)) ([07320ab](https://github.com/silensses-maker/front_BES/commit/07320ab5930991a03cb7b721bde2d50c3919fc61))
* **polarization:** up to 10 overlaid series told apart by color, line style and markers, plus "overlay all measures" with undo ([#129](https://github.com/silensses-maker/front_BES/issues/129)) ([16c5436](https://github.com/silensses-maker/front_BES/commit/16c5436e98889ba317e5939347af4b4de6ae3e8b))
* **quotas:** per-role network cap, custom-run quotas and validation … ([16e7d82](https://github.com/silensses-maker/front_BES/commit/16e7d825e69e97590b8ba93c4a3b8aa36d88657d))
* **quotas:** per-role network cap, custom-run quotas and validation ([#122](https://github.com/silensses-maker/front_BES/issues/122)) ([1fc4306](https://github.com/silensses-maker/front_BES/commit/1fc43063aaba2eb3bb5665710dbf6baef72204fd))
* refactor partner logos into a centralized configuration; add CNRS logo and update landing and login pages ([986772e](https://github.com/silensses-maker/front_BES/commit/986772e839e4be19d0634017243b1869330bac2c))
* **results:** update results page to reflect upcoming content and remove placeholder data ([28b16ac](https://github.com/silensses-maker/front_BES/commit/28b16aca6adc01d9b03e7631e5b28266c8ba9c38))
* simplify logo SVG and update to use currentColor for fill ([69120e7](https://github.com/silensses-maker/front_BES/commit/69120e7753e6c771f6371328e28635944c72798a))
* **simulation-history:** enhance simulation history management with search and filter capabilities ([2835e6a](https://github.com/silensses-maker/front_BES/commit/2835e6ae5411ac40a29bacf4a8f89f1b5eac069e))
* **simulation-stream:** refactor WebSocket management ([2835e6a](https://github.com/silensses-maker/front_BES/commit/2835e6ae5411ac40a29bacf4a8f89f1b5eac069e))
* update de-cluster playback delay to ensure full animation completion before advancing rounds ([64e85fd](https://github.com/silensses-maker/front_BES/commit/64e85fd77d7a4704344f9fa5566611c77c85ae7e))
* update step review to include formatted values and validation messages ([dc9fa3c](https://github.com/silensses-maker/front_BES/commit/dc9fa3c740fda482c4a1c5a646e454732f9a374e))
* **wizard:** hide the save-mode selector; runs are saved in DEBUG mode by design ([#133](https://github.com/silensses-maker/front_BES/issues/133)) ([c806bd2](https://github.com/silensses-maker/front_BES/commit/c806bd252ee0f9859c842207dee0fdff70930504))


### Bug Fixes

* adjust board page to include live summary in new simulation panel ([dc9fa3c](https://github.com/silensses-maker/front_BES/commit/dc9fa3c740fda482c4a1c5a646e454732f9a374e))
* **bench:** Sonar reliability and security issues on new code ([#126](https://github.com/silensses-maker/front_BES/issues/126)) ([302e1ef](https://github.com/silensses-maker/front_BES/commit/302e1ef2e82a04a502a4369f26b46dd63ea4d95a))
* correct type imports and improve type safety in various components ([2835e6a](https://github.com/silensses-maker/front_BES/commit/2835e6ae5411ac40a29bacf4a8f89f1b5eac069e))
* **frames:** read beliefs in the backend block layout ([#118](https://github.com/silensses-maker/front_BES/issues/118), [#95](https://github.com/silensses-maker/front_BES/issues/95)) ([36e4032](https://github.com/silensses-maker/front_BES/commit/36e403250ce6985e90a46757c0feec60921af6c8))
* **i18n:** format retentionNote string for better readability in Spanish locale ([34d42e7](https://github.com/silensses-maker/front_BES/commit/34d42e7515f51653738c99326b42cd84a8771fbb))
* **live-run:** handle 409 on cancel and finished runs without topology ([#124](https://github.com/silensses-maker/front_BES/issues/124)) ([4d4f79b](https://github.com/silensses-maker/front_BES/commit/4d4f79b749279e5ef18e73fbdb57288eac6c78a7))
* mark intentional fire-and-forget promises with void (Sonar S9383) ([8a39747](https://github.com/silensses-maker/front_BES/commit/8a3974767de9705b06e0e392d481ecac57a46ccc))
* **polarization:** Sonar reliability issues in the polarization tab and chart options ([#129](https://github.com/silensses-maker/front_BES/issues/129)) ([6ca08bb](https://github.com/silensses-maker/front_BES/commit/6ca08bbc8a3f0e877255b98098a4a2e48e03ae0e))
* report version check under required context check-version; restore 2.0.0 ([e916cb5](https://github.com/silensses-maker/front_BES/commit/e916cb5ebd9ea7eeb24cd4eb94eb47aed4bef51a))
* **run-view:** share topology downloads between the selector, the stream prefetch and the WS handler ([#140](https://github.com/silensses-maker/front_BES/issues/140)) ([af00ce2](https://github.com/silensses-maker/front_BES/commit/af00ce2a911038f471de10c992e53cd16adbcbfd))
* **theme:** dark-mode secondary text reaches 7:1 contrast; no opacity-lowered text ([eeb8e07](https://github.com/silensses-maker/front_BES/commit/eeb8e078bccf57346426b0ae7fbbfa0827e06ae0))
* **timeline:** keep the hover tooltip inside the timeline (no horizontal page scroll) ([624d114](https://github.com/silensses-maker/front_BES/commit/624d114b7fe14b4ae7cc02849fc595b0fcfebd55))
* **topology:** Sonar reliability issues in the topology worker ([#128](https://github.com/silensses-maker/front_BES/issues/128)) ([1e429fe](https://github.com/silensses-maker/front_BES/commit/1e429feff7f4f4f86a237467d259025667d9d936))
* update sonar coverage exclusions to include static config constants ([8fb08b2](https://github.com/silensses-maker/front_BES/commit/8fb08b2b5975558df59acea11b80ca2b63d6aab6))
* **user:** tolerate backends without usageLimits so session restore never hangs ([4fe0436](https://github.com/silensses-maker/front_BES/commit/4fe043654bcfa5e36f3388f903028bc6dbb25dbd))
* **wizard:** drop no-op threshold/confidence inputs and allow full enums in custom networks ([#120](https://github.com/silensses-maker/front_BES/issues/120)) ([9d07341](https://github.com/silensses-maker/front_BES/commit/9d0734173e9fda46538be6a1656baabca3cdd0b4))
* **ws:** read finalRound, validate frame headers and route binary frames by runId ([#119](https://github.com/silensses-maker/front_BES/issues/119)) ([98e3642](https://github.com/silensses-maker/front_BES/commit/98e3642598524232410b301277e4c3f451159119))


### Performance Improvements

* **canvas:** per-round colors and sizes pushed straight to cosmos.gl (LUT buffers, create() instead of render()), session fallback and adaptive repaint cap ([#142](https://github.com/silensses-maker/front_BES/issues/142)) ([5de8dec](https://github.com/silensses-maker/front_BES/commit/5de8dec36ecfbce6e8b8b54d7cc25df49f5bceb9))
* **routes:** lazy-load pages, split the visualization stack and load MathJax on demand ([#130](https://github.com/silensses-maker/front_BES/issues/130)) ([ed59e82](https://github.com/silensses-maker/front_BES/commit/ed59e82fc3588f565a75a58265c9c0bfaceba3e5))
* **routes:** lazy-load pages, split the visualization stack and load… ([f9a1548](https://github.com/silensses-maker/front_BES/commit/f9a154823a46fab106c442e486e65004847f6675))
* **topology:** fetch, parse and merge in a Web Worker, retried pages with a visible error instead of partial networks, load progress ([#128](https://github.com/silensses-maker/front_BES/issues/128)) ([16ab3cd](https://github.com/silensses-maker/front_BES/commit/16ab3cd176f774033a94f3a87910791e1216aaa0))

## [2.0.0](https://github.com/silensses-maker/front_BES/compare/v1.0.0...v2.0.0) (2026-07-21)

Primera versión estable de la 2.x (release manual, etiquetada retroactivamente como
`v2.0.0` el 2026-11-10). Las versiones 2.0.1 a 2.0.21 fueron incrementos manuales de
`package.json`, sin tag ni entrada propia; sus cambios se recogen en la entrada 2.0.22,
la primera generada por release-please (ver issue #78).

### Highlights

* Refactor completo: migración a Bun + Rsbuild + React 19 con arquitectura
  Feature-Sliced Design.
* Streaming en vivo de simulaciones por websocket, con replay REST de
  respaldo.
* Autenticación Firebase con roles y límites de uso.
* Internacionalización (i18next), UI nueva (Tailwind 4 + Radix), gráficas
  ECharts y visualización de redes con Cosmograph.
* Producción desplegada en el servidor del LIPN vía Docker + nginx; Vercel
  queda solo para previews de PR.

*(El detalle de la fase alpha está en las entradas siguientes.)*

## [2.0.1-alpha.14](https://github.com/silensses-maker/front_BES/compare/front_bes-v2.0.0-alpha.14...front_bes-v2.0.1-alpha.14) (2026-04-13)


### Features

* add CI build and deploy steps; include vercel.json configuration ([b43144d](https://github.com/silensses-maker/front_BES/commit/b43144d40d505e3e50990e1eb6ee1a1131e7dac7))
* add edit display name functionality ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* add firebase-admin and implement usage limits migration script ([bd31791](https://github.com/silensses-maker/front_BES/commit/bd317914bcefb075f591d7b5f2908dbca799c88f))
* add framer-motion and motion libraries for animations ([b478dd8](https://github.com/silensses-maker/front_BES/commit/b478dd8c672b9628f817f30c4ec0ecfcb113f01d))
* add GitHub Action to check for version bumps in package.json ([ac199e4](https://github.com/silensses-maker/front_BES/commit/ac199e4f1bd8e13572f9dbe879ff2e7efe626cf1))
* add GitHub Action to check for version bumps in package.json ([06f396c](https://github.com/silensses-maker/front_BES/commit/06f396c3e22887e5fc21ef0de787aca97ac4f755))
* add i18next for internationalization and implement language swi… ([33cea67](https://github.com/silensses-maker/front_BES/commit/33cea67c6da3215b5ce5c550d75faedbb3d75c7d))
* add i18next for internationalization and implement language switcher ([be56e9a](https://github.com/silensses-maker/front_BES/commit/be56e9a178a467afc5a20ceb70564745665ff4f7))
* add NetworkPreviewDialog component and integrate it into CustomSimulationForm ([c301e70](https://github.com/silensses-maker/front_BES/commit/c301e708ed25dc025b5a0b543edef65052042214))
* add profile sheet component with user settings management and integrate into settings dropdown ([e2bcf25](https://github.com/silensses-maker/front_BES/commit/e2bcf257c738a7a04d7ba47895de4eaac4100eba))
* add ProfilePage route and integrate with ProtectedRoute ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* add release-please configuration and manifest files for automated releases ([c6977f8](https://github.com/silensses-maker/front_BES/commit/c6977f8bf96ba308ef3f6ec0946642f7936b27cc))
* add results page and markdown rendering for simulation experiments ([83c23d1](https://github.com/silensses-maker/front_BES/commit/83c23d1612e894358409a14d74c20c2f49bddaad))
* add SonarCloud analysis job to CI and update version to 2.0.0-a… ([4781f12](https://github.com/silensses-maker/front_BES/commit/4781f12f303d0946a3c816f31d7bc5d220b051b5))
* add SonarCloud analysis job to CI and update version to 2.0.0-alpha.11 ([7840528](https://github.com/silensses-maker/front_BES/commit/7840528ed8aaaff37ac2ddf77f7e0632dd1e602f))
* add Tailwind CSS configuration and global styles ([2912bd1](https://github.com/silensses-maker/front_BES/commit/2912bd1ce427c85dc8fc2b8233cf37afe2308b93))
* add version bump check workflow, update package.json and bun.lo… ([a413e31](https://github.com/silensses-maker/front_BES/commit/a413e313d87b1131ab2a6d25204d5bb5e02550d5))
* add version bump check workflow, update package.json and bun.lock, implement logging and toast notifications in user API and auth store ([66ff076](https://github.com/silensses-maker/front_BES/commit/66ff0767c199ac0ec73530791ef8f447133fbe68))
* add Wiki page and integrate MathJax for rendering equations; update Header and Introduction components with new logos and navigation links ([b3b75a4](https://github.com/silensses-maker/front_BES/commit/b3b75a41cd3d6fbe52f4b0f980536af7a5a9d869))
* bump version to 1.0.0 in package.json ([4e0f2e1](https://github.com/silensses-maker/front_BES/commit/4e0f2e1a1620f43617eb84554d51db923875cdba))
* bump version to 1.0.0 in package.json ([24686fc](https://github.com/silensses-maker/front_BES/commit/24686fc3d70ea77a8635c720de0e56d7f273763c))
* Enhance UI components with theme support and improve accessibility ([367729f](https://github.com/silensses-maker/front_BES/commit/367729f25182e086d36ce41b810c3088992bc847))
* **i18n:** enhance user feedback with localized error and success messages for user actions ([0b63fef](https://github.com/silensses-maker/front_BES/commit/0b63fef9e577bf1fb5dd13e80bb99332df268d29))
* **i18n:** update English and Spanish translations for home and wiki sections ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* implement account deactivation functionality ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* implement Button component and utility function for class merging DUMMY ([a67f6ba](https://github.com/silensses-maker/front_BES/commit/a67f6ba077a180510b890919b7ca8c90e1e12147))
* implement CSV import/export functionality for simulations; add useCsvIO hook and update components to support file operations ([e0d98e5](https://github.com/silensses-maker/front_BES/commit/e0d98e58679f97337436114986402233694f2c1c))
* implement dashboard layout with header and settings dropdown, add theme and language selection ([3775f54](https://github.com/silensses-maker/front_BES/commit/3775f5417c207fe09dad697672d6b6c78ada46b3))
* implement dashboard layout with header, sidebar, and breadcrumb navigation ([5675285](https://github.com/silensses-maker/front_BES/commit/56752851c23ab2e8e366cad4bd0b803c325dcc67))
* implement landing layout with header and footer, add routing for home, wiki, and results pages ([a6148ae](https://github.com/silensses-maker/front_BES/commit/a6148ae2c9c56efb0c16f66ae02ad671969bbb6d))
* implement user authentication flow with login/logout functional… ([8355f1d](https://github.com/silensses-maker/front_BES/commit/8355f1de0f3e737052df9923490d371a083c0a1c))
* implement user authentication flow with login/logout functionality and protected routes ([dd8112a](https://github.com/silensses-maker/front_BES/commit/dd8112adab74edae9e8054acc5b5341de7cb806e))
* initialize project with basic setup ([936065e](https://github.com/silensses-maker/front_BES/commit/936065ed3543e0714e16b3e1b74f3eb7c54bd2be))
* integrate Firebase for user authentication and management ([8aa8e1b](https://github.com/silensses-maker/front_BES/commit/8aa8e1b4bc7f344f2d7fe95ebf71e1d09d2b1a78))
* integrate Firebase for user authentication and management ([0bcdf59](https://github.com/silensses-maker/front_BES/commit/0bcdf59c661a827483af6292ac1370aa4e9e8c5a))
* **styles:** add scroll margin for headers and MathJax styling ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* **ui:** implement Card, Separator, Table, and Tabs components for UI consistency ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))


### Bug Fixes

* add config in vite.preview to enable host domain ([322d7e6](https://github.com/silensses-maker/front_BES/commit/322d7e6120c67f3f957344d7ea3fda8ae1a624a1))
* correct action reference in release-please workflow ([9d42510](https://github.com/silensses-maker/front_BES/commit/9d425109ca958ae6c57c9a4b5233fc8a0af9d9d1))
* remove push trigger from version bump check workflow ([c732644](https://github.com/silensses-maker/front_BES/commit/c73264415bc649b746655586b1b113fcf9244f9a))
* remove unnecessary opacity class from progress indicators in profile sheet ([77df140](https://github.com/silensses-maker/front_BES/commit/77df14039bc5000b31abe4ea4d425fb84555382b))
* **ui:** update Table of Contents to use correct translation keys ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* update loading indicator in ProtectedRoute to use fragment ([43f94c9](https://github.com/silensses-maker/front_BES/commit/43f94c9d785147d5c51e4458e6780c1f6c607463))
* update loading indicator in ProtectedRoute to use fragment ([547da1a](https://github.com/silensses-maker/front_BES/commit/547da1a862889c5caf633ccfc46c1c2e4cc2b4a3))
* update userApi.getById to include deactivated status ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))

## [2.1.0-alpha.11](https://github.com/silensses-maker/front_BES/compare/front_bes-v2.0.0-alpha.11...front_bes-v2.1.0-alpha.11) (2026-04-13)


### Features

* add CI build and deploy steps; include vercel.json configuration ([b43144d](https://github.com/silensses-maker/front_BES/commit/b43144d40d505e3e50990e1eb6ee1a1131e7dac7))
* add edit display name functionality ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* add firebase-admin and implement usage limits migration script ([bd31791](https://github.com/silensses-maker/front_BES/commit/bd317914bcefb075f591d7b5f2908dbca799c88f))
* add framer-motion and motion libraries for animations ([b478dd8](https://github.com/silensses-maker/front_BES/commit/b478dd8c672b9628f817f30c4ec0ecfcb113f01d))
* add GitHub Action to check for version bumps in package.json ([ac199e4](https://github.com/silensses-maker/front_BES/commit/ac199e4f1bd8e13572f9dbe879ff2e7efe626cf1))
* add GitHub Action to check for version bumps in package.json ([06f396c](https://github.com/silensses-maker/front_BES/commit/06f396c3e22887e5fc21ef0de787aca97ac4f755))
* add i18next for internationalization and implement language swi… ([33cea67](https://github.com/silensses-maker/front_BES/commit/33cea67c6da3215b5ce5c550d75faedbb3d75c7d))
* add i18next for internationalization and implement language switcher ([be56e9a](https://github.com/silensses-maker/front_BES/commit/be56e9a178a467afc5a20ceb70564745665ff4f7))
* add NetworkPreviewDialog component and integrate it into CustomSimulationForm ([c301e70](https://github.com/silensses-maker/front_BES/commit/c301e708ed25dc025b5a0b543edef65052042214))
* add profile sheet component with user settings management and integrate into settings dropdown ([e2bcf25](https://github.com/silensses-maker/front_BES/commit/e2bcf257c738a7a04d7ba47895de4eaac4100eba))
* add ProfilePage route and integrate with ProtectedRoute ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* add release-please configuration and manifest files for automated releases ([c6977f8](https://github.com/silensses-maker/front_BES/commit/c6977f8bf96ba308ef3f6ec0946642f7936b27cc))
* add results page and markdown rendering for simulation experiments ([83c23d1](https://github.com/silensses-maker/front_BES/commit/83c23d1612e894358409a14d74c20c2f49bddaad))
* add SonarCloud analysis job to CI and update version to 2.0.0-a… ([4781f12](https://github.com/silensses-maker/front_BES/commit/4781f12f303d0946a3c816f31d7bc5d220b051b5))
* add SonarCloud analysis job to CI and update version to 2.0.0-alpha.11 ([7840528](https://github.com/silensses-maker/front_BES/commit/7840528ed8aaaff37ac2ddf77f7e0632dd1e602f))
* add Tailwind CSS configuration and global styles ([2912bd1](https://github.com/silensses-maker/front_BES/commit/2912bd1ce427c85dc8fc2b8233cf37afe2308b93))
* add version bump check workflow, update package.json and bun.lo… ([a413e31](https://github.com/silensses-maker/front_BES/commit/a413e313d87b1131ab2a6d25204d5bb5e02550d5))
* add version bump check workflow, update package.json and bun.lock, implement logging and toast notifications in user API and auth store ([66ff076](https://github.com/silensses-maker/front_BES/commit/66ff0767c199ac0ec73530791ef8f447133fbe68))
* add Wiki page and integrate MathJax for rendering equations; update Header and Introduction components with new logos and navigation links ([b3b75a4](https://github.com/silensses-maker/front_BES/commit/b3b75a41cd3d6fbe52f4b0f980536af7a5a9d869))
* bump version to 1.0.0 in package.json ([4e0f2e1](https://github.com/silensses-maker/front_BES/commit/4e0f2e1a1620f43617eb84554d51db923875cdba))
* bump version to 1.0.0 in package.json ([24686fc](https://github.com/silensses-maker/front_BES/commit/24686fc3d70ea77a8635c720de0e56d7f273763c))
* Enhance UI components with theme support and improve accessibility ([367729f](https://github.com/silensses-maker/front_BES/commit/367729f25182e086d36ce41b810c3088992bc847))
* **i18n:** enhance user feedback with localized error and success messages for user actions ([0b63fef](https://github.com/silensses-maker/front_BES/commit/0b63fef9e577bf1fb5dd13e80bb99332df268d29))
* **i18n:** update English and Spanish translations for home and wiki sections ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* implement account deactivation functionality ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
* implement Button component and utility function for class merging DUMMY ([a67f6ba](https://github.com/silensses-maker/front_BES/commit/a67f6ba077a180510b890919b7ca8c90e1e12147))
* implement CSV import/export functionality for simulations; add useCsvIO hook and update components to support file operations ([e0d98e5](https://github.com/silensses-maker/front_BES/commit/e0d98e58679f97337436114986402233694f2c1c))
* implement dashboard layout with header and settings dropdown, add theme and language selection ([3775f54](https://github.com/silensses-maker/front_BES/commit/3775f5417c207fe09dad697672d6b6c78ada46b3))
* implement dashboard layout with header, sidebar, and breadcrumb navigation ([5675285](https://github.com/silensses-maker/front_BES/commit/56752851c23ab2e8e366cad4bd0b803c325dcc67))
* implement landing layout with header and footer, add routing for home, wiki, and results pages ([a6148ae](https://github.com/silensses-maker/front_BES/commit/a6148ae2c9c56efb0c16f66ae02ad671969bbb6d))
* implement user authentication flow with login/logout functional… ([8355f1d](https://github.com/silensses-maker/front_BES/commit/8355f1de0f3e737052df9923490d371a083c0a1c))
* implement user authentication flow with login/logout functionality and protected routes ([dd8112a](https://github.com/silensses-maker/front_BES/commit/dd8112adab74edae9e8054acc5b5341de7cb806e))
* initialize project with basic setup ([936065e](https://github.com/silensses-maker/front_BES/commit/936065ed3543e0714e16b3e1b74f3eb7c54bd2be))
* integrate Firebase for user authentication and management ([8aa8e1b](https://github.com/silensses-maker/front_BES/commit/8aa8e1b4bc7f344f2d7fe95ebf71e1d09d2b1a78))
* integrate Firebase for user authentication and management ([0bcdf59](https://github.com/silensses-maker/front_BES/commit/0bcdf59c661a827483af6292ac1370aa4e9e8c5a))
* **styles:** add scroll margin for headers and MathJax styling ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* **ui:** implement Card, Separator, Table, and Tabs components for UI consistency ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))


### Bug Fixes

* add config in vite.preview to enable host domain ([322d7e6](https://github.com/silensses-maker/front_BES/commit/322d7e6120c67f3f957344d7ea3fda8ae1a624a1))
* correct action reference in release-please workflow ([9d42510](https://github.com/silensses-maker/front_BES/commit/9d425109ca958ae6c57c9a4b5233fc8a0af9d9d1))
* remove push trigger from version bump check workflow ([c732644](https://github.com/silensses-maker/front_BES/commit/c73264415bc649b746655586b1b113fcf9244f9a))
* remove unnecessary opacity class from progress indicators in profile sheet ([77df140](https://github.com/silensses-maker/front_BES/commit/77df14039bc5000b31abe4ea4d425fb84555382b))
* **ui:** update Table of Contents to use correct translation keys ([b66a701](https://github.com/silensses-maker/front_BES/commit/b66a701ff6354fd6ac4a92da2478ee2e95b17678))
* update loading indicator in ProtectedRoute to use fragment ([43f94c9](https://github.com/silensses-maker/front_BES/commit/43f94c9d785147d5c51e4458e6780c1f6c607463))
* update loading indicator in ProtectedRoute to use fragment ([547da1a](https://github.com/silensses-maker/front_BES/commit/547da1a862889c5caf633ccfc46c1c2e4cc2b4a3))
* update userApi.getById to include deactivated status ([a726a81](https://github.com/silensses-maker/front_BES/commit/a726a8141ff2400078dbfe6b17f00e079b559fac))
