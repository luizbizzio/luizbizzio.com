# Contributing to luizbizzio.com

Serve [`public`](public) with `python -m http.server 8000 --directory public`. The main view is [`public/index.html`](public/index.html), site entries live in [`public/sites.json`](public/sites.json), and cached release and repository information lives in [`public/project-metadata.json`](public/project-metadata.json).

## Review a change

- Check the grid and 3D gallery on desktop and a narrow screen. Try keyboard navigation, reduced motion, and the fallback when a preview image cannot load.
- For a project entry, verify the live site and repository links, and check how its cover and metadata appear in both views.
- For changes to the gallery, assets, or generated data, use the relevant checks in [`scripts`](scripts), including `test-ui.mjs`, `audit-ux.mjs`, and `audit-assets.mjs`. The [UI workflow](.github/workflows/test-ui.yml) shows their setup and invocation.

Include before and after screenshots for visual changes, or a small example entry for changes to project data.
