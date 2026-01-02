# Contributing to Obzorarr

> This document is a work in progress.

## Getting Started

```bash
bun install    # Install dependencies and set up pre-commit hooks
bun run dev    # Start development server
```

## Coding Standards

Follow the patterns established in `.augment/rules/bun-svelte-pro.md`. Key principles:

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props()`)
- Maintain strict TypeScript configuration
- Keep comments minimal (explain why, not what)
- SSR data loading in `+page.server.ts` files

## Pre-commit Hooks

This project uses [prek](https://github.com/j178/prek) to run pre-commit hooks. Hooks are automatically installed when you run `bun install`.

### Pre-commit (every commit)

- Trailing whitespace removal
- End-of-file newline fix
- YAML, JSON, TOML syntax validation
- Merge conflict detection
- Private key detection
- Large file prevention (max 500KB)
- Prettier formatting (staged files only)

### Pre-push (before push)

- TypeScript and Svelte type checking (`bun run check`)
- Test suite (`bun test`)

### Manual Commands

```bash
prek run --all-files    # Run all hooks on entire codebase
prek run prettier       # Run specific hook
```

### Skipping Hooks

In emergencies, you can skip hooks:

```bash
git commit --no-verify
git push --no-verify
```

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<optional scope>): <description>
```

### Types

| Type     | Purpose                                      |
| -------- | -------------------------------------------- |
| feat     | New feature                                  |
| fix      | Bug fix                                      |
| refactor | Code change that neither fixes nor adds      |
| perf     | Performance improvement                      |
| style    | Formatting, whitespace                       |
| test     | Adding or updating tests                     |
| docs     | Documentation only                           |
| build    | Build system or dependencies                 |
| ops      | Operational changes (CI/CD, deployment)      |
| chore    | Other changes that don't modify src or tests |

### Guidelines

- Use lowercase for everything except proper nouns
- Use imperative mood ("add feature" not "added feature")
- Do not end with a period
- Use `!` for breaking changes: `feat(api)!: ...`

### Examples

```
feat: add email notifications on new direct messages
fix(shopping-cart): prevent ordering an empty cart
perf!: improve memory usage in visitor count
```
