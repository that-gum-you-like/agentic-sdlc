## ADDED Requirements

### Requirement: Defeat tests SHALL catch known anti-patterns statically
A Jest test suite at `LinguaFlow/__tests__/defeat/` MUST scan the codebase for recurring anti-patterns and fail if any are found. A `test:defeat` npm script MUST exist in package.json.

#### Scenario: No explicit any types in source code
- **WHEN** defeat tests scan `src/**/*.ts` and `src/**/*.tsx` files
- **THEN** no files contain `: any` type annotations (excluding type guards and legitimate uses documented in comments)

#### Scenario: No console.log in production code
- **WHEN** defeat tests scan `src/**/*.ts` and `src/**/*.tsx` files
- **THEN** no files contain `console.log` calls (test files are excluded)

#### Scenario: Service files respect size limits
- **WHEN** defeat tests scan `src/services/**/*.ts` files
- **THEN** no service file exceeds 150 lines

#### Scenario: Screen files respect size limits
- **WHEN** defeat tests scan `app/**/*.tsx` screen files
- **THEN** no screen file exceeds 200 lines

#### Scenario: Services return {data, error} pattern
- **WHEN** defeat tests scan exported async functions in `src/services/**/*.ts`
- **THEN** each function returns an object with `data` and `error` properties
