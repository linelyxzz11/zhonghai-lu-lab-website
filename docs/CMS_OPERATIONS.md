# Decap CMS Operations

## 1. Access control

The CMS uses GitHub as its identity and authorization provider. It does not maintain a separate password database.

- Long-term repository owner: a lab or institutional GitHub Organization, not an individual's account.
- Organization continuity: maintain at least two GitHub Organization owners.
- Repository administrator: GitHub `Admin` role.
- Approved content editors: GitHub repository collaborator with `Write` role.
- Review-only participants: use GitHub pull-request review; do not grant CMS write access.
- Public visitors: no repository permission and no CMS write access.
- Open Authoring remains disabled.

The GitHub OAuth client secret must be stored only as a Cloudflare Worker secret. It must never be committed to this repository or exposed in `static/admin/config.yml`.

### Recommended role model

| Responsibility | GitHub | Cloudflare |
| --- | --- | --- |
| Lab technical owner | Organization Owner / repository Admin | Super Administrator |
| Website maintainer | Repository Maintain | Workers Platform Admin |
| News/publication/award editor | Repository Write | No Cloudflare access required |
| Reviewer | Repository Read or Triage | No Cloudflare access required |
| Temporary developer | Outside collaborator with time-limited access | Only if deployment debugging is required |

## 2. Primary update workflow

The three primary CMS collections are ordered first:

1. **News** — creates `content/<language>/news/<slug>/index.md` and stores uploaded images under `static/images/uploads/`.
2. **Publications** — creates `content/<language>/publications/<slug>/index.md`; author values must use profile slugs such as `zhonghai-lu` or `member-01`.
3. **Awards** — creates `content/<language>/awards/<slug>/index.md`.

English and Chinese records are independent so that editors can review translations before publishing. Use the same slug in both languages when the two records describe the same item.

## 3. Editorial workflow

`publish_mode: editorial_workflow` is enabled.

1. Editor creates or changes a record in `/admin/`.
2. Decap CMS saves the change to a Git branch and marks it as a draft.
3. The editor moves it to review after checking title, date, image, links, and bilingual consistency.
4. An authorized maintainer publishes the entry.
5. GitHub receives the commit or merged pull request.
6. Cloudflare Pages detects the new commit, runs the Hugo build, and deploys the generated static site.

## 4. Local testing

Run the Hugo preview and Decap local proxy in separate terminals:

```powershell
pnpm dev
pnpm cms
```

Then open `http://127.0.0.1:1313/admin/`. The local proxy writes directly to the working tree, so inspect `git diff` before committing.

## 5. Production OAuth setup

1. Create a GitHub OAuth App.
2. Deploy the Cloudflare Worker OAuth proxy recommended by the Decap documentation.
3. Set the OAuth App callback URL to `https://<worker-domain>/callback`.
4. Store `GITHUB_OAUTH_ID` and `GITHUB_OAUTH_SECRET` as encrypted Cloudflare Worker secrets.
5. Replace the placeholder `backend.base_url` in `static/admin/config.yml` with the Worker URL.
6. Push the configuration and test login with an approved GitHub collaborator.

## 6. Publishing checklist

- Use a stable lowercase slug with hyphens.
- Confirm the publication date and external links.
- Use descriptive image alt text.
- Do not upload copyrighted or unverified images.
- Check both language versions.
- Preview desktop and mobile layouts.
- Publish only after the Cloudflare preview build passes.

## 7. Ownership succession

Do not transfer the repository from one personal account directly to another personal account. Use this sequence:

1. Create the lab GitHub Organization and appoint at least two owners.
2. Bind the production website to a stable custom domain.
3. Transfer the repository from the personal account to the Organization.
4. Update `backend.repo` in `static/admin/config.yml`.
5. Install the Cloudflare GitHub integration for the Organization repository.
6. Create a new Cloudflare Pages project for the transferred repository and attach the existing custom domain.
7. Verify production deployment and authenticated CMS publishing.
8. Remove or downgrade the former maintainer only after the new owners have tested repository, OAuth Worker, Pages, DNS, and rollback access.

Cloudflare account continuity should be handled by inviting the successor as a Super Administrator to the existing account. After the successor has verified access, the former administrator can be downgraded or can leave the account.
