# Rahim's portfolio

A React & TypeScript based portfolio showcasing interactive Three.js and shader experiments.

Directly incorporated third-party code, fonts and data are documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 🚀 Setup

```bash
# Install dependencies
pnpm install

# Start development server at localhost:6180
pnpm dev

# Create new experiments
pnpm create:experiment:webgl "Your Experiment Name"
pnpm create:experiment:tsl "Your Experiment Name"

# Run formatting, lint, types, unit tests, token checks and a production build
pnpm check

# Run all of the above plus the complete isolated browser suite
pnpm check:all
```

## ⚡ Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Three.js** for 3D graphics (WebGL/WebGPU)
- **Tailwind CSS** + **Shadcn** for UI

## Public repository boundary

The application, development scripts and runtime assets belong in this repository.
Personal briefs, conversation notes and research under `docs/`, `CLAUDE.md`,
`taste/` and locally installed agent tools stay on the author's machine. They are
not required to install, build or run the site. `pnpm-lock.yaml` remains tracked.

Everything under `public/` is downloadable from the deployed site, including
files no page links to. Keep source archives, comparison pages, screenshots and
image originals under the ignored `output/` directory. The favicon generator
writes its comparisons there and copies only the selected Pixel Heat R exports
into `public/`. Remove identifying image metadata before adding runtime images.

Ignore rules do not remove files from earlier commits. Review history separately
before publishing an existing repository.

`pnpm check:publication` checks candidate files and the entire deployed `public/`
directory, including ignored assets, for private paths, credential patterns,
absolute user-directory paths and embedded image metadata. It reports locations
without printing sensitive values. The check runs in `pnpm check` and CI.
CI also scans the file versions and messages in every incoming commit, so a
later deletion cannot hide an earlier private file from the check.

Before committing, use `pnpm check:publication --staged` to inspect the actual
index. Before publishing a branch, use `pnpm check:publication --history HEAD`
to inspect every reachable file version and commit message. Pass a revision
range to audit only new commits. These targeted checks do not establish
authorship or replace reviewing commit identities, asset provenance and licences.

When private development commits exist, prepare a clean snapshot on the reviewed
default branch. Do not merge or publish the development branch first: deleting
files in a later commit does not remove them from earlier history. A snapshot
also inherits its base history, which must be reviewed separately.
