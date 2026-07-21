# Changelog

## [2.0.0](https://github.com/silensses-maker/front_BES/compare/v1.0.0...v2.0.0) (2026-07-21)

Primera versión estable de la 2.x (release manual; release-please sigue
desactivado — ver issue #78).

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
